import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';

test('applies default thresholds and splits/dedupes URLs', () => {
  const config = loadConfig({ URLS_TO_CHECK: ' https://a.com/ , https://b.com/x,,https://a.com/ ' });
  assert.deepEqual(config.urls, ['https://a.com/', 'https://b.com/x']);
  assert.deepEqual(config.thresholds, { lcp: 2500, cls: 0.1, inp: 200 });
  assert.equal(config.runsPerUrl, 3);
  assert.equal(config.webhookUrl, null);
});

test('empty threshold variables fall back to defaults (unset GitHub vars are empty strings)', () => {
  const config = loadConfig({ URLS_TO_CHECK: 'https://a.com', MAX_LCP: '', MAX_CLS: ' ', MAX_INP: '300' });
  assert.deepEqual(config.thresholds, { lcp: 2500, cls: 0.1, inp: 300 });
});

test('rejects missing or invalid URLs', () => {
  assert.throws(() => loadConfig({}), ConfigError);
  assert.throws(() => loadConfig({ URLS_TO_CHECK: 'https://a.com,ftp://b.com' }), /#2/);
  assert.throws(() => loadConfig({ URLS_TO_CHECK: 'https://a.com', WEBHOOK_URL: 'not-a-url' }), ConfigError);
});

test('does not leak the webhook URL in errors', () => {
  const secret = 'ftp://hooks.example.com/token-123';
  assert.throws(
    () => loadConfig({ URLS_TO_CHECK: 'https://a.com', WEBHOOK_URL: secret }),
    (err) => err instanceof ConfigError && !err.message.includes('token-123'),
  );
});

test('rejects invalid numeric thresholds', () => {
  for (const [name, value] of [['MAX_LCP', 'abc'], ['MAX_CLS', '-0.1'], ['MAX_INP', '0'], ['RUNS_PER_URL', '1.5'], ['RUNS_PER_URL', '0']]) {
    assert.throws(() => loadConfig({ URLS_TO_CHECK: 'https://a.com', [name]: value }), ConfigError, `${name}=${value}`);
  }
});
