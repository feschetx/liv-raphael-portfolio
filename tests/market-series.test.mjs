import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {atOrBefore,joinIntraday,mergeDailyHistory} from '../market-series.js';
import {chartData} from '../portfolio-charts.js';
import {valuePortfolio} from '../portfolio-math.js';

test('currency lookup uses only rates available at the selected time',()=>{
  assert.equal(atOrBefore([[10,1],[20,2]],9),undefined);
  assert.deepEqual(atOrBefore([[10,1],[20,2]],19),[10,1]);
});
test('daily backfill keeps archived days and excludes an unfinished close',()=>{
  const original=[{date:'2026-10-30',samsung:225000,eurkrw:1492,eurusd:1.12}];
  const bars=[[Date.parse('2026-11-02T00:00:00Z')/1000,210000],[Date.parse('2026-11-03T00:00:00Z')/1000,211000]];
  const rates=[{date:'2026-11-02',eurkrw:1500,eurusd:1.13}];
  const merged=mergeDailyHistory(original,bars,rates,Date.parse('2026-11-03T04:00:00Z'));
  assert.deepEqual(merged.map(r=>r.date),['2026-10-30','2026-11-02']);
  assert.equal(merged[0].samsung,225000);
  assert.throws(()=>mergeDailyHistory(original,bars,[],Date.parse('2026-11-04T00:00:00Z')));
});
test('intraday keeps the last stock price after close while FX moves',()=>{
  const start=Date.parse('2026-11-05T00:00:00Z')/1000;
  const series={samsung:[[start,200000]],eurkrw:[[start,1500],[start+300,1510]],eurusd:[[start,1.12],[start+300,1.13]]};
  const quotes={samsung:{price:200000,asOf:new Date(start*1000).toISOString()},eurkrw:{price:1510,asOf:new Date((start+300)*1000).toISOString()},eurusd:{price:1.13,asOf:new Date((start+300)*1000).toISOString()}};
  const result=joinIntraday(series,quotes);
  assert.equal(result.sessionDate,'2026-11-05');
  assert.equal(result.points[1].samsung,200000);
  assert.equal(result.points[1].eurkrw,1510);
});
test('both charts finish at the same portfolio value as the quote cards',async()=>{
  const portfolio=JSON.parse(await fs.readFile(new URL('../portfolio-data.json',import.meta.url),'utf8'));
  const snapshot={time:Date.parse('2026-11-05T12:00:00Z'),samsung:201500,eurkrw:1506.9,eurusd:1.1227};
  const quotes=Object.fromEntries(['samsung','eurkrw','eurusd'].map(key=>[key,{price:snapshot[key]}]));
  const feed={quotes,history:[...portfolio.history,{date:'2026-11-04',samsung:210000,eurkrw:1500,eurusd:1.12}],intraday:{points:[{...snapshot,time:snapshot.time-300000},snapshot]}};
  for(const mode of ['history','intraday']) {
    const result=chartData(portfolio,feed,mode,snapshot.time);
    for(const series of result.series)assert.ok(Math.abs(series.points.at(-1).value-valuePortfolio(portfolio.positions[series.name],quotes,.0435,'2026-11-05').total)<1e-9);
  }
  assert.equal(chartData(portfolio,feed,'history',snapshot.time).rows.at(-1).date,'2026-11-05');
});

test('Nvidia charts reconcile with current cards and do not backdate the purchase',async()=>{
  const portfolio=JSON.parse(await fs.readFile(new URL('../portfolio-data.json',import.meta.url),'utf8'));
  const purchase=portfolio.positions.Raphael.nvidia,now=Date.parse(purchase.recorded_at)+300000;
  const market={samsung:210000,eurkrw:1500,eurusd:purchase.purchase_fx,nvidia:purchase.buy_price};
  const quotes=Object.fromEntries(Object.entries(market).map(([key,price])=>[key,{price}]));
  const feed={quotes,history:portfolio.history,intraday:{points:[{...market,time:Date.parse(purchase.recorded_at)-300000},{...market,time:now}]}};
  for(const mode of ['history','intraday']) {
    const result=chartData(portfolio,feed,mode,now),liv=result.series[0],raphael=result.series[1];
    assert.ok(Math.abs(raphael.points.at(-1).value-valuePortfolio(portfolio.positions.Raphael,quotes,.0435,'2026-11-11').total)<1e-8);
    assert.equal(raphael.points[0].value,liv.points[0].value);
    assert.ok(Math.abs(raphael.points.at(-1).value-liv.points.at(-1).value-purchase.cost)<1e-8);
  }
});
