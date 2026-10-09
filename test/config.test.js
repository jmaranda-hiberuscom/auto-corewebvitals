import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../src/config.js';

const storageState = Buffer.from(JSON.stringify({ cookies: [], origins: [] })).toString('base64');
const baseEnv = {
  GSC_PROPERTIES: ' sc-domain:example.com , https://www.example.com/ , sc-domain:example.com ',
  GSC_STORAGE_STATE_BASE64: storageState,
  EMAIL_API_KEY: 'test-email-key',
  EMAIL_FROM: 'Core Web Vitals <cwv@example.com>',
  EMAIL_TO: 'team@example.com, owner@example.com',
};

test('applies standard budgets and splits/dedupes properties and recipients', () => {
  const config = loadConfig(baseEnv);
  assert.deepEqual(config.properties, ['sc-domain:example.com', 'https://www.example.com/']);
  assert.deepEqual(config.devices, ['MOBILE', 'DESKTOP']);
  assert.deepEqual(config.thresholds, { lcp: 2500, cls: 0.1, inp: 200 });
  assert.equal(config.storageStateBase64, storageState);
  assert.deepEqual(config.email.to, ['team@example.com', 'owner@example.com']);
  assert.equal(config.email.apiUrl, 'https://api.resend.com/emails');
});

test('empty threshold and device variables fall back to defaults', () => {
  const config = loadConfig({ ...baseEnv, GSC_PROPERTIES: 'sc-domain:example.com', GSC_DEVICES: '', MAX_LCP: '', MAX_CLS: ' ', MAX_INP: '' });
  assert.deepEqual(config.thresholds, { lcp: 2500, cls: 0.1, inp: 200 });
  assert.deepEqual(config.devices, ['MOBILE', 'DESKTOP']);
});

test('rejects missing or invalid GSC properties and devices', () => {
  assert.throws(() => loadConfig({ ...baseEnv, GSC_PROPERTIES: '' }), ConfigError);
  assert.throws(() => loadConfig({ ...baseEnv, GSC_PROPERTIES: 'https://a.com,ftp://b.com' }), /#2/);
  assert.throws(() => loadConfig({ ...baseEnv, GSC_PROPERTIES: 'sc-domain:bad/path' }), /#1/);
  assert.throws(() => loadConfig({ ...baseEnv, GSC_DEVICES: 'TABLET' }), /MOBILE y\/o DESKTOP/);
});

test('rejects missing email configuration without echoing the API key', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, EMAIL_FROM: '' }),
    (err) => err instanceof ConfigError && !err.message.includes('test-email-key'),
  );
  assert.throws(() => loadConfig({ ...baseEnv, EMAIL_API_URL: 'not-a-url' }), ConfigError);
  assert.throws(() => loadConfig({ ...baseEnv, EMAIL_TO: 'not-an-email' }), ConfigError);
});

test('rejects invalid and non-standard GSC thresholds', () => {
  for (const [name, value] of [['MAX_LCP', 'abc'], ['MAX_CLS', '-0.1'], ['MAX_INP', '0']]) {
    assert.throws(() => loadConfig({ ...baseEnv, [name]: value }), ConfigError, `${name}=${value}`);
  }
  assert.throws(() => loadConfig({ ...baseEnv, MAX_LCP: '3000' }), /Search Console solo permite/);
});

test('rejects malformed Playwright storage state without disclosing it', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, GSC_STORAGE_STATE_BASE64: 'not-a-state' }),
    (err) => err instanceof ConfigError && !err.message.includes('not-a-state'),
  );
});
