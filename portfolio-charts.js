import {valuePortfolio} from './portfolio-math.js?v=20261111-nvda1';

const hkDate=milliseconds=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(milliseconds));
const rowQuotes=row=>Object.fromEntries(['samsung','eurkrw','eurusd','nvidia'].map(key=>[key,{price:row[key]}]));
const euro=new Intl.NumberFormat(undefined,{style:'currency',currency:'EUR'});
const signed=value=>(value<0?'−':'+')+euro.format(Math.abs(value));
const pct=new Intl.NumberFormat(undefined,{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
const asPercent=n=>pct.format(n/100);

// Chain returns, treating new capital as available at the start of its interval.
export function performancePoints(points) {
  let growth=1;
  return points.map((p,i)=>{
    if(i) {
      const prev=points[i-1],opening=prev.value+(p.invested-prev.invested);
      if(!(opening>0))throw new Error('Performance requires a positive opening balance');
      growth*=p.value/opening;
    }
    return {...p,value:(growth-1)*100};
  });
}
const htmlDate=date=>new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));

export function chartData(portfolio,feed,mode,now=Date.now()) {
  let rows;
  if(mode==='intraday')rows=(feed.intraday?.points??[]).map(row=>({...row,date:hkDate(row.time)}));
  else {
    const date=hkDate(now);
    const dated=new Map((feed.history??portfolio.history).filter(row=>row.date<=date).map(row=>[row.date,{...row,time:Date.parse(row.date+'T00:00:00Z')}]));
    dated.set(date,{date,time:Date.parse(date+'T00:00:00Z'),samsung:feed.quotes.samsung.price,eurkrw:feed.quotes.eurkrw.price,eurusd:feed.quotes.eurusd.price,nvidia:feed.quotes.nvidia?.price});
    rows=[...dated.values()].sort((a,b)=>a.time-b.time);
  }
  const series=Object.entries(portfolio.positions).map(([name,position],index)=>{
    const points=rows.map(row=>{
      const result=valuePortfolio(position,rowQuotes(row),portfolio.snapshot.bond_yield,row.date,mode==='intraday'?row.time:undefined);
      return {time:row.time,date:row.date,value:mode==='history'&&row.date===position.purchase_date?position.cost:result.total,invested:result.invested};
    });
    return {name,color:index===0?'#4f46e5':'#0d9488',cost:points.at(-1)?.invested??position.cost,points};
  });
  return {rows,series};
}

const NS='http://www.w3.org/2000/svg';
function svgNode(name,attributes={},text) {
  const node=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  if(text!==undefined)node.textContent=text;
  return node;
}

function drawChart(container,series,mode,percent=false) {
  if(!series.length||!series[0].points.length){container.textContent='Intraday prices are not available yet.';return;}
  const same=series.length===2&&series[0].points.length===series[1].points.length&&series[0].points.every((p,i)=>Math.abs(p.value-series[1].points[i].value)<(percent?1e-9:.005));
  const visible=same?[{...series[0],name:'Liv & Raphael'}]:series;
  const values=visible.flatMap(s=>s.points.map(p=>p.value));
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,percent?0.1:mode==='intraday'?.8:5);
  const rough=span/5,scale=10**Math.floor(Math.log10(rough));
  const step=[1,2,5,10].find(n=>n*scale>=rough)*scale;
  const low=Math.floor((min-span*.1)/step)*step,high=Math.ceil((max+span*.1)/step)*step;
  const first=visible[0].points[0].time,last=visible[0].points.at(-1).time;
  const x=time=>58+(time-first)/Math.max(last-first,1)*744,y=value=>292-(value-low)/(high-low)*270;
  const svg=svgNode('svg',{viewBox:'0 0 820 340',width:'100%',role:'img','aria-label':percent?'Portfolio performance in percent for the selected period':mode==='intraday'?'Intraday portfolio value in euros. Times shown in Korea Standard Time.':'Daily portfolio values since purchase, including latest available quotes.'});
  for(let value=low;value<=high+step/10;value+=step) {
    const tick=Number(value.toFixed(Math.max(0,-Math.floor(Math.log10(step)))));
    svg.append(svgNode('line',{x1:58,y1:y(value),x2:802,y2:y(value),stroke:percent&&tick===0?'#8995aa':'#e8edf5'}),svgNode('text',{x:49,y:y(value)+4,'text-anchor':'end','font-size':11,fill:'#606b7b'},percent?tick+'%':'€'+value.toFixed(step<1?1:0)));
  }
  if(!percent&&mode==='history'&&series[0].cost>=low&&series[0].cost<=high) {
    const ref=y(series[0].cost);
    svg.append(svgNode('line',{x1:58,y1:ref,x2:802,y2:ref,stroke:'#a6afc0','stroke-dasharray':'5 4'}),svgNode('text',{x:800,y:ref-6,'text-anchor':'end','font-size':10,fill:'#606b7b'},'Invested '+euro.format(series[0].cost)));
  }
  const tooltipTime=new Intl.DateTimeFormat(undefined,mode==='intraday'?{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}:{timeZone:'UTC',month:'short',day:'numeric'});
  for(const s of visible) {
    svg.append(svgNode('polyline',{fill:'none',stroke:s.color,'stroke-width':2.4,points:s.points.map(p=>`${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}));
    for(const p of s.points) {
      const dot=svgNode('circle',{cx:x(p.time),cy:y(p.value),r:mode==='intraday'?2:2.6,fill:s.color});
      dot.append(svgNode('title',{},`${s.name} · ${tooltipTime.format(new Date(p.time))}${mode==='intraday'?' KST':''} · ${percent?asPercent(p.value):euro.format(p.value)}`));svg.append(dot);
    }
  }
  const count=mode==='intraday'?5:7;
  for(let i=0;i<count;i++) {
    const time=first+(last-first)*i/(count-1);
    svg.append(svgNode('text',{x:x(time),y:315,'text-anchor':'middle','font-size':10.5,fill:'#606b7b'},tooltipTime.format(new Date(time))));
  }
  container.replaceChildren(svg);
  document.getElementById('chart-legend').textContent=same?'Liv & Raphael — identical values':visible.map(s=>s.name+(s.name==='Liv'?' (purple)':' (green)')).join(' · ');
}

function updateHistory(portfolio,feed) {
  const {rows,series}=chartData(portfolio,feed,'history');
  const body=document.getElementById('daily-history-body');
  const children=series.map(s=>s.name);
  const fragment=document.createDocumentFragment();
  rows.forEach((row,index)=>{
    const tr=document.createElement('tr');
    [row.date,'₩'+Math.round(row.samsung).toLocaleString(),row.eurkrw.toFixed(2),row.eurusd.toFixed(4),...series.map(s=>euro.format(s.points[index].value))].forEach((value,column)=>{const td=document.createElement('td');td.textContent=value;if(column)td.className='num';tr.append(td);});
    fragment.append(tr);
  });
  body.replaceChildren(fragment);
  document.getElementById('history-count').textContent=rows.length+' dates';
  document.getElementById('history-range').textContent=`Show daily values (${rows[0].date} → ${rows.at(-1).date})`;
  return children;
}

export function createChartController() {
  let active='history',portfolio,feed,percent=false,asOf,owner='All';
  try{percent=localStorage.getItem('portfolio-chart-unit')==='percent';}catch{}
  const owners=['Liv','Raphael','All'];
  try{const saved=localStorage.getItem('portfolio-chart-owner');if(owners.includes(saved))owner=saved;}catch{}
  const historyButton=document.getElementById('view-history'),intradayButton=document.getElementById('view-intraday');
  const units=document.createElement('div');
  units.className='chart-toggle';units.setAttribute('role','group');units.setAttribute('aria-label','Chart measure');
  const unitButtons=['Value (€)','Performance (%)'].map((label,i)=>{
    const button=document.createElement('button');
    button.type='button';button.textContent=label;button.disabled=true;button.setAttribute('aria-pressed',String(!i));
    button.addEventListener('click',()=>{
      percent=Boolean(i);try{localStorage.setItem('portfolio-chart-unit',percent?'percent':'euro');}catch{}
      render();
    });
    units.append(button);return button;
  });
  historyButton.parentElement.after(units);
  const ownerGroup=document.createElement('div');
  ownerGroup.className='chart-toggle';ownerGroup.setAttribute('role','group');ownerGroup.setAttribute('aria-label','Portfolio shown');
  const ownerButtons=owners.map(name=>{
    const button=document.createElement('button');
    button.type='button';button.textContent=name;button.disabled=true;
    button.setAttribute('aria-pressed',String(name===owner));
    button.addEventListener('click',()=>{
      owner=name;try{localStorage.setItem('portfolio-chart-owner',name);}catch{}
      render();
    });
    ownerGroup.append(button);return button;
  });
  historyButton.parentElement.before(ownerGroup);
  function render() {
    if(!feed)return;
    const data=chartData(portfolio,feed,active,asOf);
    const selected=owner==='All'?data.series:data.series.filter(s=>s.name===owner);
    const series=percent?selected.map(s=>({...s,points:performancePoints(s.points)})):selected;
    drawChart(document.getElementById('portfolio-chart'),series,active,percent);
    unitButtons.forEach((button,i)=>{button.disabled=false;button.setAttribute('aria-pressed',String(Boolean(i)===percent));});
    ownerButtons.forEach((button,i)=>{button.disabled=false;button.setAttribute('aria-pressed',String(owners[i]===owner));});
    historyButton.setAttribute('aria-pressed',String(active==='history'));
    intradayButton.setAttribute('aria-pressed',String(active==='intraday'));
    document.getElementById('chart-title').textContent=percent?(active==='intraday'?'Intraday portfolio performance':'Portfolio performance since 7 July'):(active==='intraday'?'Intraday portfolio value':'Portfolio value since 7 July');
    document.getElementById('chart-date').textContent=active==='intraday'?htmlDate(feed.intraday.sessionDate)+' · KST':'through '+htmlDate(data.rows.at(-1).date);
    if(percent){
      document.getElementById('chart-summary').textContent=series.map(s=>s.name+': '+asPercent(s.points.at(-1).value)).join(' · ');
      document.getElementById('chart-note').textContent=(active==='intraday'?'Performance starts at 0% at the first quote of the day (Korea time).':'Performance starts at 0% on 7 July.')+' Returns compound between chart points. New money counts toward the opening balance of the interval in which it was added, so a deposit alone does not change performance.';
      return;
    }
    const changes=selected.map(s=>{
      const current=s.points.at(-1).value,base=active==='intraday'?s.points[0].value:s.cost;
      const contribution=active==='intraday'?s.points.at(-1).invested-s.points[0].invested:0;
      const delta=current-base-contribution;
      return `${s.name}: ${euro.format(current)} (${signed(delta)}, ${delta<0?'−':'+'}${Math.abs(delta/base*100).toFixed(2)}%)`;
    });
    document.getElementById('chart-summary').textContent=changes.join(' · ')+(active==='intraday'?' change excluding added investment since the first available point.':' gain versus total recorded investment.');
    document.getElementById('chart-note').textContent=active==='intraday'?'Five-minute source data, with the latest quote added. Times are Korea Standard Time (KST). Stocks retain their latest quote outside trading hours; currencies can still move. New investments create a step in portfolio value and are excluded from the displayed change. The bond remains modeled.':'Daily market history is refreshed automatically. Nvidia enters Raphael’s portfolio on 11 November 2026; the increase from adding money is not a gain. The last point uses the latest available stock and currency quotes. The bond remains modeled.';
  }
  historyButton.addEventListener('click',()=>{active='history';render();});
  intradayButton.addEventListener('click',()=>{active='intraday';render();});
  return {showSnapshot(p){
    portfolio=p;asOf=Date.parse(p.snapshot.as_of+'T12:00:00+08:00');
    feed={history:p.history,quotes:rowQuotes(p.snapshot)};intradayButton.disabled=true;render();
  },update(p,f){portfolio=p;feed=f;asOf=undefined;intradayButton.disabled=!(f.intraday?.points?.length>=2);if(intradayButton.disabled)active='history';updateHistory(p,f);render();}};
}
