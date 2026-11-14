import {tradeRows} from './portfolio-math.js?v=20261114-lots';
const euro=new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR'});
const signed=n=>(n<0?'−':n>0?'+':'')+euro.format(Math.abs(n));
const price=(n,ccy)=>(ccy==='KRW'?'₩':'US$')+n.toLocaleString('en-GB',{minimumFractionDigits:ccy==='KRW'?0:2,maximumFractionDigits:ccy==='KRW'?0:2});
export function createTradeController(){
  let owner='All',rows=[];
  const buttons=[...document.querySelectorAll('[data-trades-owner]')];
  const body=document.getElementById('trades-body');
  function render(){
    const visible=rows.filter(r=>owner==='All'||r.owner===owner);
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tradesOwner===owner)));
    const fragment=document.createDocumentFragment();
    for(const r of visible){
      const tr=document.createElement('tr');tr.dataset.tradeId=r.id;tr.dataset.owner=r.owner;
      const values=[r.date,r.owner==='Raphael'?'Raph':r.owner,r.asset,r.quantity.toLocaleString('en-GB',{maximumFractionDigits:4})+' '+r.unit,price(r.buyPrice,r.currency),price(r.currentPrice,r.currency),euro.format(r.cost),euro.format(r.value),signed(r.pnl),(r.returnPercent<0?'−':'+')+Math.abs(r.returnPercent).toFixed(2)+'%'];
      values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i>=3)td.className='num';if(i>=8)td.classList.add(r.pnl<0?'neg':r.pnl>0?'pos':'neutral');
        if(i===8&&r.nativePnl!==undefined){const small=document.createElement('small');small.className='trade-secondary';small.textContent=(r.nativePnl<0?'−':r.nativePnl>0?'+':'')+'US$'+Math.abs(r.nativePnl).toFixed(2);td.append(small);}
        if(i===2&&r.estimated){const small=document.createElement('small');small.className='trade-estimated';small.textContent='Estimated bond value';td.append(small);}
        tr.append(td);
      });fragment.append(tr);
    }
    body.replaceChildren(fragment);
    const cost=visible.reduce((s,r)=>s+r.cost,0),pnl=visible.reduce((s,r)=>s+r.pnl,0);
    document.getElementById('trades-count').textContent=visible.length+' purchases';
    document.getElementById('trades-summary').textContent=`${owner==='Raphael'?'Raph':owner==='All'?'All trades':owner} · Cost ${euro.format(cost)} · Unrealised P&L ${signed(pnl)}`;
  }
  buttons.forEach(b=>b.addEventListener('click',()=>{owner=b.dataset.tradesOwner;render();}));
  return {update(portfolio,quotes,date){rows=tradeRows(portfolio,quotes,date);render();}};
}
