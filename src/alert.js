// Slack rejects messages with more than 50 blocks; keep the alert deliverable even if everything fails.
const MAX_LISTED = 40;

const truncate = (text, max = 300) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const escapeSlack = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const title = (report) => `Core Web Vitals: presupuesto superado en ${report.failures.length} URL(s)`;
const failureLines = (failure) =>
  failure.error ? [`ERROR: ${truncate(failure.error)}`] : failure.violations.map((v) => v.message);

export function detectFormat(webhookUrl) {
  const host = new URL(webhookUrl).hostname;
  if (host === 'hooks.slack.com') return 'slack';
  if (/(^|\.)(webhook\.office\.com|logic\.azure\.com|powerplatform\.com)$/.test(host)) return 'teams';
  return 'generic';
}

export function buildText(report) {
  const lines = [`${title(report)} (${report.timestamp})`];
  for (const failure of report.failures) {
    lines.push('', `FALLIDO: ${failure.url}`, ...failureLines(failure).map((line) => `  - ${line}`));
  }
  lines.push('', `Perfil: ${report.profile}`);
  if (report.runUrl) lines.push(`Ejecución: ${report.runUrl}`);
  return lines.join('\n');
}

function slackPayload(report) {
  const hidden = report.failures.length - MAX_LISTED;
  const context = [`*Ejecución:* ${report.timestamp}`, `*Perfil:* ${escapeSlack(report.profile)}`];
  if (report.runUrl) context.push(`<${report.runUrl}|Ver ejecución en GitHub Actions>`);
  if (hidden > 0) context.push(`…y ${hidden} URL(s) más`);

  return {
    text: title(report),
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title(report) } },
      ...report.failures.slice(0, MAX_LISTED).map((failure) => ({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [`*FALLIDO* · ${escapeSlack(failure.url)}`, ...failureLines(failure).map((l) => `• ${escapeSlack(l)}`)].join('\n'),
        },
      })),
      { type: 'context', elements: context.map((text) => ({ type: 'mrkdwn', text })) },
    ],
  };
}

function teamsPayload(report) {
  const hidden = report.failures.length - MAX_LISTED;
  const body = [
    { type: 'TextBlock', text: title(report), weight: 'Bolder', size: 'Large', color: 'Attention', wrap: true },
    { type: 'TextBlock', text: `Ejecución: ${report.timestamp} · ${report.profile}`, isSubtle: true, spacing: 'None', wrap: true },
  ];
  for (const failure of report.failures.slice(0, MAX_LISTED)) {
    body.push({ type: 'TextBlock', text: `FALLIDO · ${failure.url}`, weight: 'Bolder', wrap: true, separator: true });
    for (const line of failureLines(failure)) body.push({ type: 'TextBlock', text: line, wrap: true, spacing: 'None' });
  }
  if (hidden > 0) body.push({ type: 'TextBlock', text: `…y ${hidden} URL(s) más`, isSubtle: true, wrap: true });

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body,
          actions: report.runUrl ? [{ type: 'Action.OpenUrl', title: 'Ver ejecución', url: report.runUrl }] : [],
        },
      },
    ],
  };
}

export function buildPayload(format, report) {
  if (format === 'slack') return slackPayload(report);
  if (format === 'teams') return teamsPayload(report);
  return { text: buildText(report), status: 'FALLIDO', ...report };
}

export async function sendAlert(webhookUrl, report) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(detectFormat(webhookUrl), report)),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new Error(`El webhook respondió HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
}
