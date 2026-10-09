import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMetrics, evaluateBudget } from '../src/budget.js';
import { inpFromLatencies, median } from '../src/stats.js';

const thresholds = { lcp: 2500, cls: 0.1, inp: 200 };

test('passes when every metric is at or below its limit', () => {
  assert.deepEqual(evaluateBudget({ lcp: 2500, cls: 0.1, inp: 200 }, thresholds), []);
  assert.deepEqual(evaluateBudget({ lcp: 2500.4, cls: 0.1004, inp: 199.6 }, thresholds), [], 'compares rounded values');
});

test('reports each exceeded metric with the expected message', () => {
  const violations = evaluateBudget({ lcp: 3400.2, cls: 0.25, inp: 350 }, thresholds);
  assert.deepEqual(
    violations.map((v) => v.message),
    ['LCP obtenido: 3400ms | Límite: 2500ms', 'CLS obtenido: 0.25 | Límite: 0.1', 'INP obtenido: 350ms | Límite: 200ms'],
  );
});

test('an unmeasured INP is not a violation', () => {
  assert.deepEqual(evaluateBudget({ lcp: 1000, cls: 0, inp: null }, thresholds), []);
  assert.equal(describeMetrics({ lcp: 1000, cls: 0, inp: null }), 'LCP 1000ms · CLS 0 · INP n/d');
});

test('median ignores missing samples', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, 5, null]), 5);
  assert.equal(median([null]), null);
});

test('INP is the worst interaction, skipping one outlier per 50 interactions', () => {
  assert.equal(inpFromLatencies([]), null);
  assert.equal(inpFromLatencies([40, 120, 80]), 120);
  const many = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(inpFromLatencies(many), 98);
});
