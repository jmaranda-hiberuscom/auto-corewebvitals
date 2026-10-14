import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';

const baseEnv = {
  CRUX_ORIGINS: ' https://orain.eus/ , https://www.example.com , https://orain.eus ',
  CRUX_API_KEY: 'test-crux-key',
};

test('normalizes origins with standard budgets without an external email service', () => {
  const config = loadConfig(baseEnv);
  assert.deepEqual(config.origins, ['https://orain.eus', 'https://www.example.com']);
  assert.deepEqual(config.devices, ['MOBILE', 'DESKTOP']);
  assert.deepEqual(config.thresholds, { lcp: 2500, cls: 0.1, inp: 200 });
  assert.equal(config.apiKey, 'test-crux-key');
  assert.equal(config.github, null);
  assert.equal(config.email, undefined);
});

test('empty threshold and device variables fall back to defaults', () => {
  const config = loadConfig({ ...baseEnv, CRUX_DEVICES: '', MAX_LCP: '', MAX_CLS: ' ', MAX_INP: '' });
  assert.deepEqual(config.thresholds, { lcp: 2500, cls: 0.1, inp: 200 });
  assert.deepEqual(config.devices, ['MOBILE', 'DESKTOP']);
});

test('rejects missing or invalid CrUX origins, API key and devices', () => {
  assert.throws(() => loadConfig({ ...baseEnv, CRUX_ORIGINS: '' }), /CRUX_ORIGINS es obligatorio/);
  assert.throws(() => loadConfig({ ...baseEnv, CRUX_API_KEY: '' }), /CRUX_API_KEY es obligatorio/);
  assert.throws(() => loadConfig({ ...baseEnv, CRUX_ORIGINS: 'https://a.com,ftp://b.com' }), /#2/);
  assert.throws(() => loadConfig({ ...baseEnv, CRUX_ORIGINS: 'https://example.com/path' }), /#1/);
  assert.throws(() => loadConfig({ ...baseEnv, CRUX_DEVICES: 'TABLET' }), /MOBILE y\/o DESKTOP/);
});

test('rejects invalid thresholds and accepts custom threshold values', () => {
  for (const [name, value] of [['MAX_LCP', 'abc'], ['MAX_CLS', '-0.1'], ['MAX_INP', '0']]) {
    assert.throws(() => loadConfig({ ...baseEnv, [name]: value }), ConfigError, `${name}=${value}`);
  }
  assert.equal(loadConfig({ ...baseEnv, MAX_LCP: '3000' }).thresholds.lcp, 3000);
});

test('configures native GitHub publishing with an optional issue number', () => {
  const config = loadConfig({ ...baseEnv, GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'acme/web', REPORT_ISSUE_NUMBER: '7' });
  assert.deepEqual(config.github, { token: 'test-token', repository: 'acme/web', issueNumber: 7 });
  assert.throws(() => loadConfig({ ...baseEnv, GITHUB_REPOSITORY: 'acme/web' }), /GITHUB_TOKEN/);
  assert.throws(() => loadConfig({ ...baseEnv, GITHUB_TOKEN: 'hidden-token' }), (error) =>
    error instanceof ConfigError && !error.message.includes('hidden-token'));
  assert.throws(() => loadConfig({ ...baseEnv, GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: '../other/repo' }), ConfigError);
  for (const value of ['0', '-1', '1.5', 'not-a-number']) {
    assert.throws(() => loadConfig({ ...baseEnv, GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'acme/web', REPORT_ISSUE_NUMBER: value }), /REPORT_ISSUE_NUMBER/);
  }
});

test('demo needs no CrUX or email credentials and ignores legacy email variables', () => {
  const config = loadConfig({ EMAIL_PROVIDER: 'unused', EMAIL_TO: 'unused' }, { demo: true });
  assert.deepEqual(config.origins, []);
  assert.equal(config.github, null);
  assert.throws(() => loadConfig({}), /CRUX_ORIGINS/);
});
