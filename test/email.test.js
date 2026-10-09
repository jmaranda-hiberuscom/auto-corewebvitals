import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEmail, sendEmail } from '../src/email.js';

const report = {
  timestamp: '2026-10-09T10:00:00.000Z',
  runUrl: 'https://github.com/acme/web/actions/runs/1',
  alerts: [{
    property: 'sc-domain:example.com',
    device: 'MOBILE',
    metric: 'LCP',
    status: 'Needs improvement',
    issueText: 'LCP issue: longer than 2.5 s <mobile>',
    limit: 2500,
    unit: ' ms',
  }],
};

test('email report contains the GSC issue, configured limit, timestamp and run link', () => {
  const email = buildEmail(report);
  assert.match(email.subject, /1 issue/);
  assert.match(email.text, /LCP issue: longer than 2\.5 s/);
  assert.match(email.text, /Umbral configurado: 2500 ms/);
  assert.match(email.text, /2026-10-09T10:00:00\.000Z/);
  assert.match(email.text, /actions\/runs\/1/);
  assert.match(email.html, /&lt;mobile&gt;/);
});

test('sendEmail POSTs the report to the configured email API', async () => {
  let request;
  const config = {
    email: {
      apiUrl: 'https://api.resend.com/emails',
      apiKey: 'test-key',
      from: 'CWV <cwv@example.com>',
      to: ['one@example.com', 'two@example.com'],
    },
  };

  await sendEmail(config, report, async (url, init) => {
    request = { url, init };
    return new Response('{}', { status: 200 });
  });

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(request.init.body);
  assert.equal(body.from, config.email.from);
  assert.deepEqual(body.to, config.email.to);
  assert.match(body.text, /LCP issue/);
});

test('email API errors do not expose the API key', async () => {
  const config = {
    email: { apiUrl: 'https://api.resend.com/emails', apiKey: 'hidden-key', from: 'a@b.com', to: ['c@d.com'] },
  };

  await assert.rejects(
    sendEmail(config, report, async () => new Response('unauthorized', { status: 401 })),
    (error) => error.message.includes('HTTP 401') && !error.message.includes('hidden-key'),
  );
});