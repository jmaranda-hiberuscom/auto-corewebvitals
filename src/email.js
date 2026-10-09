export async function sendEmail(config, report, fetchImpl = fetch) {
  const message = buildEmail(report);
  const response = await fetchImpl(config.email.apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.email.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: config.email.from, to: config.email.to, ...message }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`El proveedor de email respondió HTTP ${response.status}; revisa la configuración del correo.`);
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export function buildEmail(report) {
  const subject = `[Core Web Vitals] ${report.alerts.length} issue(s) superan el umbral`;
  const textLines = [
    'Alertas de Core Web Vitals detectadas en Google Search Console',
    `Ejecución: ${report.timestamp}`,
    '',
    ...report.alerts.flatMap((alert) => [
      `${alert.property} · ${alert.device} · ${alert.metric} (${alert.status})`,
      `Issue: ${alert.issueText}`,
      `Umbral configurado: ${alert.limit}${alert.unit}`,
      '',
    ]),
    'El issue y su estado se copian del informe de Search Console; no se infiere un p75 numérico si la tabla no lo muestra.',
    ...(report.runUrl ? [`Ejecución de GitHub Actions: ${report.runUrl}`] : []),
  ];

  const rows = report.alerts.map((alert) => `
    <tr>
      <td>${escapeHtml(alert.property)}</td>
      <td>${escapeHtml(alert.device)}</td>
      <td>${escapeHtml(alert.metric)}</td>
      <td>${escapeHtml(alert.status)}</td>
      <td>${escapeHtml(alert.issueText)}</td>
      <td>${escapeHtml(`${alert.limit}${alert.unit}`)}</td>
    </tr>`).join('');
  const runLink = report.runUrl
    ? `<p><a href="${escapeHtml(report.runUrl)}">Ver ejecución en GitHub Actions</a></p>`
    : '';
  const html = `<!doctype html><html><body>
    <h2>Issues de Core Web Vitals detectados</h2>
    <p>Ejecución: ${escapeHtml(report.timestamp)}</p>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead><tr><th>Propiedad</th><th>Dispositivo</th><th>Métrica</th><th>Estado GSC</th><th>Issue</th><th>Umbral</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>El issue y su estado se copian del informe de Search Console; no se infiere un p75 numérico si la tabla no lo muestra.</p>
    ${runLink}
  </body></html>`;

  return { subject, text: textLines.join('\n'), html };
}

