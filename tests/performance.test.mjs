import test from 'node:test';
import assert from 'node:assert/strict';
import {performancePoints} from '../portfolio-charts.js';

test('a deposit preserves a prior loss; subsequent returns use all invested capital',()=>{
  const points=[{value:100,invested:100},{value:90,invested:100},{value:990,invested:1000},{value:1089,invested:1000}];
  assert.deepEqual(performancePoints(points).map(p=>Math.round(p.value*100)/100),[0,-10,-10,-1]);
  assert.equal(points[2].value,990);
});
test('intraday performance starts at the opening quote regardless of the original cost',()=>{
  const r=performancePoints([{value:250,invested:300},{value:255,invested:300}]);
  assert.equal(r[0].value,0);
  assert.ok(Math.abs(r[1].value-2)<1e-10);
});
