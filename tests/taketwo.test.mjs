import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {valuePortfolio,tradeRows,validateFeed} from '../portfolio-math.js';
import {chartData} from '../portfolio-charts.js';
const d=JSON.parse(await fs.readFile(new URL('../portfolio-data.json',import.meta.url),'utf8'));
const p=d.positions.Liv,tt=p.taketwo,q=Object.fromEntries(['samsung','eurkrw','eurusd','nvidia','taketwo'].map(k=>[k,{price:d.snapshot[k]}]));
test('Liv receives exactly EUR300 at the lowest of the four completed closes',()=>{
 assert.deepEqual(tt.closing_prices,[{date:'2026-11-18',close:216.61},{date:'2026-11-19',close:208.65},{date:'2026-11-20',close:210},{date:'2026-11-23',close:209.36}]);
 assert.equal(tt.buy_price,208.65);assert.equal(tt.reference_price_date,'2026-11-19');assert.equal(tt.cost,300);
 assert.ok(Math.abs(tt.quantity*208.65/tt.purchase_fx-300)<1e-10);assert.equal(p.cash,100);
 const before=valuePortfolio(p,q,.0435,'2026-11-23'),after=valuePortfolio(p,q,.0435,'2026-11-24');
 assert.equal(before.taketwo,0);assert.equal(before.invested,300);assert.equal(after.invested,600);
 const atCost=valuePortfolio(p,{...q,taketwo:{price:208.65},eurusd:{price:tt.purchase_fx}},.0435,'2026-11-24');
 assert.ok(Math.abs(atCost.taketwo-300)<1e-10);
 assert.throws(()=>valuePortfolio(p,{...q,taketwo:undefined},.0435,'2026-11-24'),/Missing Take-Two/);
 assert.equal(valuePortfolio(p,q,.0435,'2026-11-24',Date.parse(tt.recorded_at)-1).taketwo,0);
});
test('Liv trade P&L, holdings and chart reconcile without altering earlier ownership',()=>{
 const rows=tradeRows(d,q,'2026-11-24');assert.equal(rows.length,7);assert.equal(rows.filter(r=>r.owner==='Liv').length,3);
 const trade=rows.find(r=>r.asset==='Take-Two (TTWO)');assert.ok(trade);
 const v=valuePortfolio(p,q,.0435,'2026-11-24');
 assert.ok(Math.abs(rows.filter(r=>r.owner==='Liv').reduce((s,r)=>s+r.pnl,0)-v.gain)<1e-8);
 const chart=chartData(d,{history:d.history,quotes:q},'history',Date.parse('2026-11-24T05:15:00Z'));
 assert.ok(Math.abs(chart.series[0].points.at(-1).value-v.total)<1e-8);
 assert.equal(chart.series[0].points.find(r=>r.date==='2026-11-23').invested,300);
 assert.equal(chart.series[0].points.at(-1).invested,600);
 assert.equal(d.positions.Raphael.nvidia.quantity,20);
});
