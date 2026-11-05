import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {normalizeBars,joinIntraday,mergeDailyHistory} from '../market-series.js';

const symbols={samsung:['005930.KS','KRW'],eurkrw:['EURKRW=X','KRW'],eurusd:['EURUSD=X','USD']};
const REPO='feschetx/liv-raphael-portfolio';
const timeout=()=>AbortSignal.timeout(15000);
async function chart(symbol,query) {
  let lastError;
  for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']) {
    try {
      const response=await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`,{headers:{'User-Agent':'Mozilla/5.0'},signal:timeout()});
      if(!response.ok)throw new Error('Market source returned HTTP '+response.status);
      const body=await response.json(),result=body.chart?.result?.[0];
      if(result?.meta?.symbol!==symbol)throw new Error('Wrong instrument returned');
      return result;
    } catch(error){lastError=error;}
  }
  throw lastError;
}
async function asset(key,[symbol,currency]) {
  const payload=await chart(symbol,'interval=5m&range=5d');
  const meta=payload.meta;
  if(meta.currency!==currency||!Number.isFinite(meta.regularMarketPrice)||meta.regularMarketPrice<=0||!Number.isFinite(meta.regularMarketTime))throw new Error('Invalid '+key+' quote');
  const age=Date.now()-meta.regularMarketTime*1000;
  if(age < -120000||age>7*86400000)throw new Error('Stale '+key+' quote');
  const regular=meta.currentTradingPeriod?.regular,now=Date.now()/1000;
  return [key,{quote:{symbol,currency,price:meta.regularMarketPrice,asOf:new Date(meta.regularMarketTime*1000).toISOString(),marketOpen:Boolean(regular&&now>=regular.start&&now<regular.end),exchange:meta.exchangeName,timezone:meta.exchangeTimezoneName},bars:normalizeBars(payload)}];
}
async function previousFeed() {
  const response=await fetch(`https://raw.githubusercontent.com/${REPO}/market-data/quotes.json?run=${Date.now()}`,{signal:timeout()});
  if(!response.ok)throw new Error('Could not read previous feed: '+response.status);
  return response.json();
}
async function historicalFx(startDate) {
  let url='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
  async function read(source) {
    const response=await fetch(source,{signal:timeout()});
    if(!response.ok)throw new Error('ECB returned HTTP '+response.status);
    const xml=await response.text(),rows=[];
    for(const match of xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)) {
      const rates=Object.fromEntries([...match[2].matchAll(/<Cube\s+currency=['"]([A-Z]+)['"]\s+rate=['"]([\d.]+)['"]/g)].map(m=>[m[1],Number(m[2])]));
      if(rates.KRW>0&&rates.USD>0)rows.push({date:match[1],eurkrw:rates.KRW,eurusd:rates.USD});
    }
    if(!rows.length)throw new Error('ECB response has no usable rates');
    return rows;
  }
  let rows=await read(url);
  if(startDate<rows.map(r=>r.date).sort()[0]){url='https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml';rows=await read(url);}
  return rows;
}

export async function collectQuotes() {
  const baseline=JSON.parse(await fs.readFile(new URL('../portfolio-data.json',import.meta.url),'utf8'));
  const old=await previousFeed();
  const history=old.history?.length?old.history:baseline.history;
  const start=Math.floor(Date.parse(history.at(-1).date+'T00:00:00Z')/1000)-7*86400;
  const [assets,daily,fx]=await Promise.all([
    Promise.all(Object.entries(symbols).map(([key,value])=>asset(key,value))),
    chart('005930.KS',`interval=1d&period1=${start}&period2=${Math.floor(Date.now()/1000)+86400}`),
    historicalFx(new Date(start*1000).toISOString().slice(0,10))
  ]);
  const quotes=Object.fromEntries(assets.map(([key,value])=>[key,value.quote]));
  const intraday=joinIntraday(Object.fromEntries(assets.map(([key,value])=>[key,value.bars])),quotes);
  const merged=mergeDailyHistory(history,normalizeBars(daily),fx);
  return {version:2,fetchedAt:new Date().toISOString(),source:'Yahoo Finance delayed market data; ECB historical FX',expectedRefreshSeconds:300,quotes,history:merged,intraday};
}

async function publish(data) {
  const token=process.env.GITHUB_TOKEN;
  if(!token||process.env.GITHUB_REPOSITORY!==REPO)throw new Error('Missing or unexpected publication target');
  const endpoint=`https://api.github.com/repos/${REPO}/contents/quotes.json`;
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const previous=await fetch(endpoint+'?ref=market-data',{headers,signal:timeout()});
  if(!previous.ok)throw new Error('Could not read previous feed: '+previous.status);
  const sha=(await previous.json()).sha;
  const body={message:'Refresh public quotes and chart history',branch:'market-data',content:Buffer.from(JSON.stringify(data)+'\n').toString('base64'),sha};
  const response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(body),signal:timeout()});
  if(!response.ok)throw new Error('Could not publish feed: '+response.status);
  console.log(`Published ${data.history.length} daily rows, ${data.intraday.points.length} intraday points at ${data.fetchedAt}`);
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const data=await collectQuotes();
  if(process.argv.includes('--publish'))await publish(data);
  else {
    const output=process.argv[process.argv.indexOf('--output')+1];
    if(!process.argv.includes('--output')||!output)throw new Error('Use --output <file> or --publish');
    await fs.writeFile(output,JSON.stringify(data)+'\n');
    console.log(JSON.stringify({fetchedAt:data.fetchedAt,dailyRows:data.history.length,lastDay:data.history.at(-1).date,intradayDate:data.intraday.sessionDate,intradayPoints:data.intraday.points.length}));
  }
}
