import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishGithubReport } from '../src/github.js';

const settings = { repository: 'acme/web', token: 'test-github-token' };
const marker = '<!-- cwv-monitor:daily-report -->';
const issue = { number: 7, state: 'open', body: marker, html_url: 'https://github.com/acme/web/issues/7' };

test('creates the report issue and posts its first comment with the built-in token', async () => {
  const requests = [];
  const responses = [[], issue, { html_url: `${issue.html_url}#issuecomment-1` }];
  const url = await publishGithubReport(settings, '# Report', async (target, init) => {
    requests.push({ target, init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  });
  assert.equal(url, `${issue.html_url}#issuecomment-1`);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-github-token');
  assert.equal(requests[1].init.method, 'POST');
  assert.match(JSON.parse(requests[1].init.body).body, /cwv-monitor:daily-report/);
  assert.equal(requests[2].target, 'https://api.github.com/repos/acme/web/issues/7/comments');
  assert.deepEqual(JSON.parse(requests[2].init.body), { body: '# Report' });
});

test('reuses the same issue without creating a new daily issue', async () => {
  const requests = [];
  await publishGithubReport(settings, '# Daily report', async (target, init) => {
    requests.push({ target, init });
    return new Response(JSON.stringify(init.method === 'GET' ? [issue] : { html_url: issue.html_url }), { status: 200 });
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].target, 'https://api.github.com/repos/acme/web/issues/7/comments');
});

test('paginates discovery and ignores pull requests that contain the marker', async () => {
  const requests = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, body: marker, pull_request: {} }));
  const responses = [firstPage, [issue], { html_url: issue.html_url }];
  await publishGithubReport(settings, '# Report', async (target, init) => {
    requests.push({ target, init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  });
  assert.match(requests[1].target, /page=2$/);
  assert.equal(requests[2].target, 'https://api.github.com/repos/acme/web/issues/7/comments');
});

test('uses an explicit issue number and reopens it before posting', async () => {
  const requests = [];
  const responses = [{ ...issue, state: 'closed' }, issue, { html_url: issue.html_url }];
  await publishGithubReport({ ...settings, issueNumber: 7 }, '# Report', async (target, init) => {
    requests.push({ target, init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  });
  assert.equal(requests[0].target, 'https://api.github.com/repos/acme/web/issues/7');
  assert.equal(requests[1].init.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[1].init.body), { state: 'open' });
});

test('explicit pull request is rejected instead of publishing into it', async () => {
  await assert.rejects(publishGithubReport({ ...settings, issueNumber: 7 }, '# Report', async () =>
    new Response(JSON.stringify({ ...issue, pull_request: {} }), { status: 200 })), /no a una pull request/);
});

test('permission errors do not expose credentials or echo the response body', async () => {
  await assert.rejects(publishGithubReport(settings, '# Report', async () =>
    new Response('test-github-token', { status: 403 })), (error) =>
    error.message.includes('HTTP 403') && !error.message.includes('test-github-token'));
});

test('rejects missing credentials and invalid repositories before network access', async () => {
  await assert.rejects(publishGithubReport({ repository: 'acme/web' }, '# Report'), /GITHUB_TOKEN/);
  await assert.rejects(publishGithubReport({ ...settings, repository: '../other/path' }, '# Report'), /GITHUB_REPOSITORY/);
});