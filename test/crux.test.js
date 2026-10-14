import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMetricStatus, parseCruxResponse, queryCruxRecord } from '../src/crux.js';

const cruxResponse = {
  record: {
    metrics: {
      largest_contentful_paint: { percentiles: { p75: 1612 } },
      cumulative_layout_shift: { percentiles: { p75: '0.14' } },
      interaction_to_next_paint: { percentiles: { p75: 93 } },
    },
    collectionPeriod: {
      firstDate: { year: 2026, month: 9, day: 14 },
      lastDate: { year: 2026, month: 10, day: 11 },
    },
  },
};

test('parses p75 values and collection period from a CrUX response', () => {
  const report = parseCruxResponse(cruxResponse, 'MOBILE');

  assert.equal(report.available, true);
  assert.deepEqual(report.metrics.map(({ key, p75 }) => ({ key, p75 })), [
    { key: 'lcp', p75: 1612 },
    { key: 'cls', p75: 0.14 },
    { key: 'inp', p75: 93 },
  ]);
  assert.deepEqual(report.missingMetrics, []);
  assert.deepEqual(report.collectionPeriod, cruxResponse.record.collectionPeriod);
});

test('classifies p75 values using the Core Web Vitals quality boundaries', () => {
  assert.equal(getMetricStatus('lcp', 2500), 'Good');
  assert.equal(getMetricStatus('lcp', 4000), 'Needs improvement');
  assert.equal(getMetricStatus('lcp', 4001), 'Poor');
  assert.equal(getMetricStatus('cls', 0.1), 'Good');
  assert.equal(getMetricStatus('cls', 0.25), 'Needs improvement');
  assert.equal(getMetricStatus('cls', 0.26), 'Poor');
  assert.equal(getMetricStatus('inp', 200), 'Good');
  assert.equal(getMetricStatus('inp', 500), 'Needs improvement');
  assert.equal(getMetricStatus('inp', 501), 'Poor');
});

test('reports missing records and individual percentiles without inventing values', () => {
  assert.equal(parseCruxResponse({}, 'DESKTOP').available, false);

  const report = parseCruxResponse({
    record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2400 } } } },
  }, 'DESKTOP');
  assert.deepEqual(report.metrics.map(({ key }) => key), ['lcp']);
  assert.deepEqual(report.missingMetrics, ['CLS', 'INP']);
});

test('queries CrUX with an API key and device-specific form factor', async () => {
  let request;
  const report = await queryCruxRecord('https://example.com', 'MOBILE', 'test-key', async (url, init) => {
    request = { url: new URL(url), init };
    return new Response(JSON.stringify(cruxResponse), { status: 200 });
  });

  assert.equal(request.url.origin, 'https://chromeuxreport.googleapis.com');
  assert.equal(request.url.pathname, '/v1/records:queryRecord');
  assert.equal(request.url.searchParams.get('key'), 'test-key');
  assert.equal(request.init.method, 'POST');
  assert.deepEqual(JSON.parse(request.init.body), {
    origin: 'https://example.com',
    formFactor: 'PHONE',
    metrics: ['largest_contentful_paint', 'cumulative_layout_shift', 'interaction_to_next_paint'],
  });
  assert.equal(report.available, true);
});

test('treats CrUX HTTP 404 as unavailable and surfaces other HTTP statuses', async () => {
  const unavailable = await queryCruxRecord('https://empty.example', 'DESKTOP', 'test-key', async () => new Response('{}', { status: 404 }));
  assert.equal(unavailable.available, false);

  await assert.rejects(
    queryCruxRecord('https://example.com', 'DESKTOP', 'test-key', async () => new Response('{}', { status: 403 })),
    /HTTP 403/,
  );
});