import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {modelBondPrice,validateFeed,valuePortfolio} from '../portfolio-math.js';

const data=JSON.parse(await fs.readFile(new URL('../portfolio-data.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-30T12:00:00Z');
const feed={version:1,fetchedAt:new Date(now).toISOString(),quotes:{
  samsung:{symbol:'005930.KS',currency:'KRW',price:225000,asOf:new Date(now-60000).toISOString()},
  eurkrw:{symbol:'EURKRW=X',currency:'KRW',price:1492.7350000000001,asOf:new Date(now-60000).toISOString()},
  eurusd:{symbol:'EURUSD=X',currency:'USD',price:1.119345,asOf:new Date(now-60000).toISOString()}
}};

test('bond price and total reconcile to the verified existing tracker',()=>{
  assert.ok(Math.abs(modelBondPrice('2026-10-30',.0435)-99.07994607938191)<1e-9);
  const result=valuePortfolio(data.positions.Liv,feed.quotes,.0435,'2026-10-30');
  assert.ok(Math.abs(result.total-295.77029678340944)<1e-9);
});
test('each child is valued from their own recorded holdings',()=>{
  const a=valuePortfolio(data.positions.Liv,feed.quotes,.0435,'2026-10-30');
  const b=valuePortfolio({...data.positions.Raphael,shares:0},feed.quotes,.0435,'2026-10-30');
  assert.ok(Math.abs(a.total-b.total-a.stock)<1e-9);
});
test('missing, zero, wrong-currency, future and excessively old prices are rejected',()=>{
  assert.equal(validateFeed(feed,now),feed);
  for(const change of [q=>q.price=0,q=>q.currency='USD',q=>q.asOf='2026-11-05T00:00:00Z',q=>q.asOf='2026-10-20T00:00:00Z']) {
    const invalid=structuredClone(feed);change(invalid.quotes.samsung);
    assert.throws(()=>validateFeed(invalid,now));
  }
});
test('a weekend quote keeps its actual market date',()=>{
  const weekend=structuredClone(feed);weekend.quotes.samsung.asOf='2026-10-28T06:30:00Z';
  assert.equal(validateFeed(weekend,now).quotes.samsung.asOf,'2026-10-28T06:30:00Z');
});
