import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { queryCruxRecord } from '../src/crux.js';
import { publishGithubReport } from '../src/github.js';
import { publishReport, runMonitor } from '../src/index.js';
import { buildReport } from '../src/report.js';

const config = loadConfig({
  CRUX_ORIGINS: 'https://example.com',
  CRUX_API_KEY: 'test-crux-key',
});
const collectionPeriod = {
  firstDate: { year: 2026, month: 9, day: 14 },
  lastDate: { year: 2026, month: 10, day: 11 },
};
const metrics = [
  { key: 'lcp', metric: 'LCP', p75: 1800, unit: ' ms' },
  { key: 'cls', metric: 'CLS', p75: 0.05, unit: '' },
  { key: 'inp', metric: 'INP', p75: 100, unit: ' ms' },
];

test('publishes one complete daily report even when all metrics are good', async () => {
  const queries = [];
  const deliveries = [];
  const report = await runMonitor(config, {
    queryRecord: async (origin, device, apiKey) => {
      queries.push({ origin, device, apiKey });
      return { available: true, metrics, missingMetrics: [], collectionPeriod };
    },
    publish: async (settings, payload) => deliveries.push({ settings, payload }),
    log: () => {},
  });

  assert.equal(queries.length, 2);
  assert.deepEqual(queries.map(({ device }) => device), ['MOBILE', 'DESKTOP']);
  assert.equal(queries[0].apiKey, 'test-crux-key');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].payload, report);
  assert.equal(report.measurements.length, 6);
  assert.ok(report.measurements.every(({ status }) => status === 'Good'));
  assert.equal(report.measurements[0].collectionPeriod, '2026-09-14 a 2026-10-11');
  assert.deepEqual(report.unavailable, []);
});

test('publishes an explicit no-data report instead of silently returning success', async () => {
  let delivered;
  await runMonitor(config, {
    queryRecord: async () => ({ available: false, metrics: [], missingMetrics: ['LCP', 'CLS', 'INP'] }),
    publish: async (settings, report) => { delivered = report; },
    log: () => {},
  });

  assert.deepEqual(delivered.measurements, []);
  assert.equal(delivered.unavailable.length, 2);
  assert.deepEqual(delivered.unavailable[0].missingMetrics, ['LCP', 'CLS', 'INP']);
});

test('includes available percentiles and identifies missing metrics in the same report', async () => {
  const report = await runMonitor(config, {
    queryRecord: async () => ({ available: true, metrics: [metrics[0]], missingMetrics: ['CLS', 'INP'], collectionPeriod }),
    publish: async () => {},
    log: () => {},
  });
  assert.equal(report.measurements.length, 2);
  assert.deepEqual(report.unavailable[0].missingMetrics, ['CLS', 'INP']);
});

test('manual demo publishes once and never calls CrUX', async () => {
  let deliveries = 0;
  const report = await runMonitor(config, {
    demo: true,
    queryRecord: async () => assert.fail('CrUX must not run in demo mode'),
    publish: async (settings, payload) => {
      assert.equal(payload.demo, true);
      deliveries++;
    },
    log: () => {},
  });
  assert.equal(deliveries, 1);
  assert.equal(report.demo, true);
});

test('API and publishing failures propagate so GitHub Actions marks the run failed', async () => {
  await assert.rejects(runMonitor(config, {
    queryRecord: async () => { throw new Error('CrUX HTTP 403'); },
    publish: async () => assert.fail('Do not publish a success report after an API failure'),
    log: () => {},
  }), /CrUX HTTP 403/);

  await assert.rejects(runMonitor(config, {
    queryRecord: async () => ({ available: true, metrics, missingMetrics: [] }),
    publish: async () => { throw new Error('GitHub HTTP 403'); },
    log: () => {},
  }), /GitHub HTTP 403/);
});

test('CrUX client, daily collector and GitHub publishing integrate without network calls', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: new URL(url), init });
    if (new URL(url).hostname === 'chromeuxreport.googleapis.com') {
      return new Response(JSON.stringify({
        record: {
          metrics: {
            largest_contentful_paint: { percentiles: { p75: 1800 } },
            cumulative_layout_shift: { percentiles: { p75: '0.05' } },
            interaction_to_next_paint: { percentiles: { p75: 100 } },
          },
          collectionPeriod,
        },
      }), { status: 200 });
    }
    return new Response(JSON.stringify(init.method === 'GET'
      ? [{ number: 7, state: 'open', body: '<!-- cwv-monitor:daily-report -->' }]
      : { html_url: 'https://github.com/acme/web/issues/7#issuecomment-1' }), { status: 200 });
  };

  await runMonitor({ ...config, github: { repository: 'acme/web', token: 'test-token' } }, {
    queryRecord: (origin, device, apiKey) => queryCruxRecord(origin, device, apiKey, fetchImpl),
    publish: (settings, report) => publishGithubReport(settings.github, buildReport(report), fetchImpl),
    log: () => {},
  });

  assert.equal(requests.length, 4);
  assert.equal(requests[3].url.href, 'https://api.github.com/repos/acme/web/issues/7/comments');
  const body = JSON.parse(requests[3].init.body);
  assert.match(body.body, /Superan el umbral: 0/);
  assert.match(body.body, /MOBILE/);
  assert.match(body.body, /DESKTOP/);
  assert.doesNotMatch(body.body, /test-token|test-crux-key/);
});

test('CLI validates missing CrUX configuration before making requests', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    env: {},
    encoding: 'utf8',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /CRUX_ORIGINS/);
  assert.doesNotMatch(result.stderr, /EMAIL_API_KEY/);
});

test('CLI demo generates local output without credentials or network requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cwv-demo-'));
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url)), '--demo'], {
      cwd: directory,
      env: {},
      encoding: 'utf8',
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const markdown = await readFile(join(directory, 'reports/core-web-vitals.md'), 'utf8');
    const report = JSON.parse(await readFile(join(directory, 'reports/core-web-vitals.json'), 'utf8'));
    assert.match(markdown, /No se ha consultado CrUX/);
    assert.equal(report.demo, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('native publishing saves output before requesting the GitHub comment', async () => {
  const order = [];
  const settings = { ...config, github: { repository: 'acme/web', token: 'test-token' } };
  const result = await publishReport(settings, { demo: true }, {
    writeReport: async () => {
      order.push('save');
      return { markdown: '# Demo', markdownPath: 'reports/core-web-vitals.md' };
    },
    publishIssue: async (github, markdown) => {
      order.push('publish');
      assert.equal(github, settings.github);
      assert.equal(markdown, '# Demo');
      return 'https://github.com/acme/web/issues/7';
    },
    log: () => {},
  });
  assert.deepEqual(order, ['save', 'publish']);
  assert.equal(result.githubUrl, 'https://github.com/acme/web/issues/7');
});

test('local publishing never calls GitHub when no repository token is configured', async () => {
  await publishReport(config, { demo: true }, {
    writeReport: async () => ({ markdown: '# Demo', markdownPath: 'reports/core-web-vitals.md' }),
    publishIssue: async () => assert.fail('No GitHub requests in local mode'),
    log: () => {},
  });
});

test('package metadata and lockfile agree and declare no third-party dependencies', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[''].name, manifest.name);
  assert.equal(lock.packages[''].version, manifest.version);
  assert.deepEqual(lock.packages[''].engines, manifest.engines);
});