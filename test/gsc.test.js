import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGscIssueRows, parseGscReportText, validateGscThresholds, STANDARD_THRESHOLDS } from '../src/gsc.js';

test('parses metric issues and ignores good or unrelated rows', () => {
  const issues = parseGscIssueRows([
    'LCP issue: longer than 2.5 s (mobile)    12 URLs',
    'CLS issue: more than 0.1 (mobile)    4 URLs',
    'INP issue: longer than 200 ms (mobile)    8 URLs',
    'All good URLs: 120',
    'Page indexing issue: Crawled - currently not indexed',
  ], 'MOBILE');

  assert.deepEqual(issues.map(({ key, status, reportedBoundary }) => ({ key, status, reportedBoundary })), [
    { key: 'lcp', status: 'Exceeds good threshold', reportedBoundary: 2500 },
    { key: 'cls', status: 'Exceeds good threshold', reportedBoundary: 0.1 },
    { key: 'inp', status: 'Exceeds good threshold', reportedBoundary: 200 },
  ]);
  assert.equal(issues[0].device, 'MOBILE');
});

test('recognizes poor and needs-improvement statuses', () => {
  const issues = parseGscIssueRows([
    'Poor LCP issue: longer than 4 s (desktop)',
    'Needs improvement INP issue: longer than 200 ms (desktop)',
  ], 'DESKTOP');

  assert.deepEqual(issues.map(({ status, reportedBoundary }) => ({ status, reportedBoundary })), [
    { status: 'Poor', reportedBoundary: 4000 },
    { status: 'Needs improvement', reportedBoundary: 200 },
  ]);
});

test('treats an empty Search Console report as unavailable rather than a breach', () => {
  assert.deepEqual(parseGscReportText('No data available for this property.', 'MOBILE'), {
    available: false,
    issues: [],
  });
});

test('accepts standard Search Console budgets and rejects arbitrary ones', () => {
  assert.doesNotThrow(() => validateGscThresholds(STANDARD_THRESHOLDS));
  assert.throws(() => validateGscThresholds({ ...STANDARD_THRESHOLDS, lcp: 3000 }), /Search Console solo permite/);
});