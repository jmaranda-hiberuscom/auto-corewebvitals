import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function escapeMarkdown(value) {
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()|]/g, '\\$&');
}

export function buildReport(report) {
  const lines = [
    `# ${report.demo ? 'Prueba de publicacion' : 'Informe diario de Core Web Vitals'}`,
    '',
    `Ejecucion: ${escapeMarkdown(report.timestamp)}`,
    '',
  ];

  if (report.demo) {
    lines.push('Esta es una prueba de publicacion y notificaciones de GitHub. No se ha consultado CrUX.', '');
    if (report.notifyUser) {
      if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(report.notifyUser)) {
        throw new Error('El destinatario de la mencion debe ser un usuario de GitHub valido.');
      }
      lines.push(`@${report.notifyUser}: prueba dirigida a tu cuenta. GitHub enviara email solo si tienes habilitadas las notificaciones por correo para menciones y conversaciones en las que participas.`, '');
    }
  } else {
    const measurements = report.measurements ?? [];
    const alertCount = measurements.filter(({ p75, limit }) => p75 > limit).length;
    lines.push(
      `Metricas disponibles: ${measurements.length}. Superan el umbral: ${alertCount}.`,
      '',
      '| Origen | Dispositivo | Metrica | p75 | Umbral | Estado CWV | Supera umbral | Periodo CrUX |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...measurements.map((measurement) => `| ${[
        measurement.origin,
        measurement.device,
        measurement.metric,
        `${measurement.p75}${measurement.unit}`,
        `${measurement.limit}${measurement.unit}`,
        measurement.status,
        measurement.p75 > measurement.limit ? 'Si' : 'No',
        measurement.collectionPeriod,
      ].map(escapeMarkdown).join(' | ')} |`),
      '',
      ...(report.unavailable ?? []).map((entry) =>
        `- ${escapeMarkdown(entry.origin)} / ${escapeMarkdown(entry.device)}: Sin datos suficientes para ${entry.missingMetrics.map(escapeMarkdown).join(', ')}.`),
      ...(measurements.length === 0 ? ['No hay metricas disponibles; esto no equivale a una evaluacion favorable.'] : []),
      '',
      'CrUX informa el percentil 75 de datos de campo sobre una ventana de 28 dias; no son medidas en tiempo real.',
      '',
    );
  }

  if (report.runUrl) {
    const url = new URL(report.runUrl);
    if (url.protocol !== 'https:') throw new Error('El enlace de ejecucion debe utilizar HTTPS.');
    lines.push(`[Ver ejecucion de GitHub Actions](${url.href.replace(/\)/g, '%29')})`, '');
  }
  return lines.join('\n');
}

export async function saveReport(report, { directory = 'reports', summaryPath = process.env.GITHUB_STEP_SUMMARY } = {}) {
  const outputDirectory = resolve(directory);
  const markdownPath = join(outputDirectory, 'core-web-vitals.md');
  const jsonPath = join(outputDirectory, 'core-web-vitals.json');
  const markdown = buildReport(report);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(markdownPath, markdown, 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (summaryPath) await appendFile(summaryPath, `${markdown}\n`, 'utf8');
  return { markdown, markdownPath, jsonPath };
}