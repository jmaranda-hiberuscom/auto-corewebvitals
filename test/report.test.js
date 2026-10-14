import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildReport, saveReport } from '../src/report.js';

const report = {
  timestamp: '2026-10-14T07:17:00.000Z',
  runUrl: 'https://github.com/acme/web/actions/runs/1',
  measurements: [{
    origin: 'https://example.com',
    device: 'MOBILE',
    metric: 'LCP',
    p75: 1800,
    limit: 2500,
    status: 'Good',
    unit: ' ms',
    collectionPeriod: '2026-09-14 a 2026-10-11',
  }],
  unavailable: [],
};

test('Markdown includes healthy measurements, budgets, period and execution link', () => {
  const markdown = buildReport(report);
  assert.match(markdown, /Metricas disponibles: 1\. Superan el umbral: 0/);
  assert.match(markdown, /1800 ms \| 2500 ms \| Good \| No/);
  assert.match(markdown, /2026-09-14 a 2026-10-11/);
  assert.match(markdown, /actions\/runs\/1/);
});

test('report identifies breaches, missing data and escapes Markdown and HTML', () => {
  const markdown = buildReport({
    ...report,
    measurements: [{ ...report.measurements[0], p75: 3000, status: 'Needs improvement' }],
    unavailable: [{ origin: '<script>|[test]', device: 'DESKTOP', missingMetrics: ['INP'] }],
  });
  assert.match(markdown, /Superan el umbral: 1/);
  assert.match(markdown, /Needs improvement \| Si/);
  assert.match(markdown, /Sin datos suficientes para INP/);
  assert.match(markdown, /&lt;script&gt;/);
  assert.ok(markdown.includes('\\|\\[test\\]'));
  assert.doesNotMatch(markdown, /<script>/);
});

test('no-data report is not presented as a favorable assessment', () => {
  assert.match(buildReport({ ...report, measurements: [] }), /no equivale a una evaluacion favorable/);
});

test('demo is clearly identified without invented metrics', () => {
  const markdown = buildReport({ demo: true, timestamp: report.timestamp });
  assert.match(markdown, /Prueba de publicacion/);
  assert.match(markdown, /No se ha consultado CrUX/);
  assert.doesNotMatch(markdown, /\| p75 \|/);
});

test('manual demo can mention the triggering account without promising email delivery', () => {
  const markdown = buildReport({ demo: true, timestamp: report.timestamp, notifyUser: 'jmaranda-hiberuscom' });
  assert.match(markdown, /^@jmaranda-hiberuscom: prueba dirigida a tu cuenta\./m);
  assert.match(markdown, /email solo si tienes habilitadas las notificaciones/);
  assert.throws(() => buildReport({ demo: true, notifyUser: 'user @another-user' }), /usuario de GitHub valido/);
});

test('regular reports do not mention users even if a demo recipient was supplied', () => {
  assert.doesNotMatch(buildReport({ ...report, notifyUser: 'jmaranda-hiberuscom' }), /@jmaranda-hiberuscom/);
});

test('saves Markdown and JSON and appends the same report to the Actions summary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cwv-report-'));
  try {
    const summaryPath = join(directory, 'summary.md');
    const saved = await saveReport(report, { directory, summaryPath });
    assert.equal(await readFile(saved.markdownPath, 'utf8'), buildReport(report));
    assert.deepEqual(JSON.parse(await readFile(saved.jsonPath, 'utf8')), report);
    assert.equal(await readFile(summaryPath, 'utf8'), `${buildReport(report)}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});