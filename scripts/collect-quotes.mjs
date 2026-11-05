import fs from 'node:fs/promises';

const symbols = {samsung:['005930.KS','KRW'], eurkrw:['EURKRW=X','KRW'], eurusd:['EURUSD=X','USD']};
async function quote(key, [symbol,currency]) {
  let lastError;
  for (const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']) {
    try {
      const response = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`, {headers:{'User-Agent':'Mozilla/5.0'}, signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error(`${key} source returned HTTP ${response.status}`);
      const body = await response.json();
      const meta = body.chart?.result?.[0]?.meta;
      if (meta?.symbol !== symbol || meta.currency !== currency || !Number.isFinite(meta.regularMarketPrice) || meta.regularMarketPrice <= 0 || !Number.isFinite(meta.regularMarketTime)) throw new Error(`Invalid ${key} quote`);
      if (meta.regularMarketTime * 1000 > Date.now() + 120000 || Date.now() - meta.regularMarketTime * 1000 > 7*86400000) throw new Error(`Stale ${key} quote`);
      const regular=meta.currentTradingPeriod?.regular;
      const now=Date.now()/1000;
      return [key,{symbol, currency, price:meta.regularMarketPrice, asOf:new Date(meta.regularMarketTime*1000).toISOString(), marketOpen:Boolean(regular && now>=regular.start && now<regular.end), exchange:meta.exchangeName, timezone:meta.exchangeTimezoneName}];
    } catch(error) {lastError=error;}
  }
  throw lastError;
}

export async function collectQuotes() {
  const quotes=Object.fromEntries(await Promise.all(Object.entries(symbols).map(([key,value])=>quote(key,value))));
  return {version:1,fetchedAt:new Date().toISOString(),source:'Yahoo Finance delayed market data',expectedRefreshSeconds:300,quotes};
}

async function publish(data) {
  const token=process.env.GITHUB_TOKEN, repo=process.env.GITHUB_REPOSITORY;
  if (!token || repo !== 'feschetx/liv-raphael-portfolio') throw new Error('Missing or unexpected publication target');
  const endpoint=`https://api.github.com/repos/${repo}/contents/quotes.json`;
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const previous=await fetch(endpoint+'?ref=market-data',{headers,signal:AbortSignal.timeout(12000)});
  if (!previous.ok && previous.status!==404) throw new Error('Could not read previous feed: '+previous.status);
  const sha=previous.ok ? (await previous.json()).sha : undefined;
  const body={message:'Refresh public market quotes',branch:'market-data',content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),...(sha?{sha}:{})};
  const response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('Could not publish feed: '+response.status);
  console.log('Published public quotes at '+data.fetchedAt);
}

const data=await collectQuotes();
if (process.argv.includes('--publish')) await publish(data);
else {
  const output=process.argv[process.argv.indexOf('--output')+1];
  if (!process.argv.includes('--output') || !output) throw new Error('Use --output <file> or --publish');
  await fs.writeFile(output,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify(data));
}
