import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { buildPayload, buildText, detectFormat, sendAlert } from '../src/alert.js';

const report = {
  timestamp: '2026-10-09T10:00:00.000Z',
  profile: 'Moto G4 · 4G · CPU 4x',
  thresholds: { lcp: 2500, cls: 0.1, inp: 200 },
  runUrl: 'https://github.com/acme/web/actions/runs/1',
  failures: [
    {
      url: 'https://shop.example.com/?a=1&b=<2>',
      error: null,
      metrics: { lcp: 3400, cls: 0.02, inp: 90 },
      violations: [{ metric: 'LCP', value: 3400, limit: 2500, unit: 'ms', message: 'LCP obtenido: 3400ms | Límite: 2500ms' }],
    },
    { url: 'https://down.example.com/', error: 'ERRORED_DOCUMENT_REQUEST: HTTP 500', metrics: null, violations: [] },
  ],
};

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('detects the webhook flavour from its host', () => {
  assert.equal(detectFormat('https://hooks.slack.com/services/T/B/X'), 'slack');
  assert.equal(detectFormat('https://acme.webhook.office.com/webhookb2/x'), 'teams');
  assert.equal(detectFormat('https://prod-01.westeurope.logic.azure.com/workflows/x'), 'teams');
  assert.equal(detectFormat('https://default.environment.api.powerplatform.com/powerautomate/x'), 'teams');
  assert.equal(detectFormat('https://evil-logic.azure.com.attacker.io/x'), 'generic');
  assert.equal(detectFormat('https://alerts.example.com/hook'), 'generic');
});

test('plain text lists URL, exact violation, errors and timestamp', () => {
  const text = buildText(report);
  assert.match(text, /2026-10-09T10:00:00\.000Z/);
  assert.match(text, /FALLIDO: https:\/\/shop\.example\.com/);
  assert.match(text, /LCP obtenido: 3400ms \| Límite: 2500ms/);
  assert.match(text, /ERROR: ERRORED_DOCUMENT_REQUEST/);
  assert.match(text, /actions\/runs\/1/);
});

test('Slack payload escapes mrkdwn control characters', () => {
  const payload = buildPayload('slack', report);
  assert.equal(payload.blocks[0].type, 'header');
  const section = payload.blocks[1].text.text;
  assert.match(section, /a=1&amp;b=&lt;2&gt;/);
  assert.match(section, /LCP obtenido: 3400ms \| Límite: 2500ms/);
  assert.equal(payload.blocks.at(-1).type, 'context');
});

test('Slack payload stays under the 50-block limit', () => {
  const failures = Array.from({ length: 80 }, (_, i) => ({ url: `https://e.com/${i}`, error: 'x', violations: [] }));
  const payload = buildPayload('slack', { ...report, failures });
  assert.ok(payload.blocks.length <= 50);
  assert.match(JSON.stringify(payload.blocks.at(-1)), /40 URL\(s\) más/);
});

test('Teams payload is an Adaptive Card message', () => {
  const payload = buildPayload('teams', report);
  const card = payload.attachments[0];
  assert.equal(card.contentType, 'application/vnd.microsoft.card.adaptive');
  assert.equal(card.content.type, 'AdaptiveCard');
  assert.ok(card.content.body.some((b) => b.text === 'LCP obtenido: 3400ms | Límite: 2500ms'));
  assert.equal(card.content.actions[0].url, report.runUrl);
});

test('generic payload keeps structured data', () => {
  const payload = buildPayload('generic', report);
  assert.equal(payload.status, 'FALLIDO');
  assert.equal(payload.failures[0].violations[0].metric, 'LCP');
  assert.equal(typeof payload.text, 'string');
});

test('sendAlert POSTs JSON and throws on non-2xx responses', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response('ok', { status: 200 });
  };
  await sendAlert('https://hooks.slack.com/services/T/B/X', report);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.ok(JSON.parse(calls[0].init.body).blocks);

  globalThis.fetch = async () => new Response('invalid_blocks', { status: 400 });
  await assert.rejects(sendAlert('https://hooks.slack.com/services/T/B/X', report), /HTTP 400: invalid_blocks/);
});
