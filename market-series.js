export const marketDate = seconds => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));

export function normalizeBars(payload) {
  const closes=payload.indicators?.quote?.[0]?.close;
  if(!Array.isArray(payload.timestamp)||!Array.isArray(closes))throw new Error('Missing market series');
  return payload.timestamp.map((time,index)=>[time,closes[index]]).filter(([time,value])=>Number.isFinite(time)&&Number.isFinite(value)&&value>0).sort((a,b)=>a[0]-b[0]);
}

export function atOrBefore(points,time) {
  let lo=0,hi=points.length-1,result;
  while(lo<=hi){const mid=(lo+hi)>>1;if(points[mid][0]<=time){result=points[mid];lo=mid+1;}else hi=mid-1;}
  return result;
}

export function joinIntraday(series,quotes) {
  const latest=Math.max(...Object.values(quotes).map(q=>Date.parse(q.asOf)/1000));
  const sessionDate=marketDate(latest);
  const timeline=[...new Set(Object.values(series).flatMap(points=>points.map(([t])=>t)))].filter(t=>t<=latest&&marketDate(t)===sessionDate).sort((a,b)=>a-b);
  const points=[];
  for(const time of timeline) {
    const stock=atOrBefore(series.samsung,time),krw=atOrBefore(series.eurkrw,time),usd=atOrBefore(series.eurusd,time);
    if(!stock||!krw||!usd||time-stock[0]>7*86400||time-krw[0]>5400||time-usd[0]>5400)continue;
    points.push({time:time*1000,samsung:stock[1],eurkrw:krw[1],eurusd:usd[1]});
  }
  const last={time:latest*1000,samsung:quotes.samsung.price,eurkrw:quotes.eurkrw.price,eurusd:quotes.eurusd.price};
  if(points.at(-1)?.time===last.time)points[points.length-1]=last;else points.push(last);
  return {sessionDate,timeZone:'Asia/Seoul',intervalMinutes:5,points};
}

export function mergeDailyHistory(previous,dailyBars,fxRows,now=Date.now()) {
  const rows=new Map(previous.map(row=>[row.date,{date:row.date,samsung:row.samsung,eurkrw:row.eurkrw,eurusd:row.eurusd,fx_date:row.fx_date??row.date}]));
  const fx=fxRows.toSorted((a,b)=>a.date.localeCompare(b.date));
  for(const [seconds,price] of dailyBars) {
    const date=marketDate(seconds);
    if(now<Date.parse(date+'T15:30:00+09:00'))continue;
    const rate=fx.filter(r=>r.date<=date).at(-1);
    if(!rate||Date.parse(date)-Date.parse(rate.date)>5*86400000)throw new Error('Missing historical FX for '+date);
    rows.set(date,{date,samsung:price,eurkrw:rate.eurkrw,eurusd:rate.eurusd,fx_date:rate.date});
  }
  return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
