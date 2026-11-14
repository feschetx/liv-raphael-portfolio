import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {valuePortfolio,tradeRows} from '../portfolio-math.js';
const data=JSON.parse(await fs.readFile(new URL('../portfolio-data.json',import.meta.url),'utf8'));
const quotes=Object.fromEntries(['samsung','eurkrw','eurusd','nvidia'].map(k=>[k,{price:data.snapshot[k]}]));
test('a second purchase adds only its dated quantity and cost, preserving earlier history',()=>{
 const p=data.positions.Raphael,lot=p.nvidia.lots[1],time=Date.parse(lot.recorded_at);
 const before=valuePortfolio(p,quotes,.0435,'2026-11-13');
 const after=valuePortfolio(p,quotes,.0435,'2026-11-14');
 assert.ok(Math.abs(after.nvidia-2*before.nvidia)<1e-8);
 assert.ok(Math.abs(after.invested-before.invested-lot.cost)<1e-8);
 assert.equal(valuePortfolio(p,quotes,.0435,'2026-11-14',time-1).nvidia,before.nvidia);
 assert.equal(valuePortfolio(p,quotes,.0435,'2026-11-14',time).nvidia,after.nvidia);
 assert.equal(p.nvidia.cost_usd,3377.5);assert.equal(p.nvidia.buy_price,168.875);
});
test('individual trade P&L reconciles to each portfolio with two distinct Nvidia lots',()=>{
 const rows=tradeRows(data,quotes,'2026-11-14');assert.equal(rows.length,6);
 assert.equal(rows.filter(r=>r.owner==='Raphael').length,4);
 assert.equal(rows.filter(r=>r.owner==='Liv').length,2);
 for(const [owner,p] of Object.entries(data.positions)){
   const v=valuePortfolio(p,quotes,.0435,'2026-11-14');
   assert.ok(Math.abs(rows.filter(r=>r.owner===owner).reduce((s,r)=>s+r.pnl,0)-v.gain)<1e-8);
 }
 const nv=rows.filter(r=>r.asset==='Nvidia (NVDA)');assert.equal(nv.length,2);
 assert.ok(Math.abs(nv.find(r=>r.date==='2026-11-14').nativePnl)<1e-8);
 assert.ok(Math.abs(nv.find(r=>r.date==='2026-11-11').nativePnl+157.3)<1e-8);
});
