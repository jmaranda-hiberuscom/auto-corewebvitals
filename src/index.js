import { pathToFileURL } from 'node:url';
import { ConfigError, loadConfig } from './config.js';
import { getMetricStatus, queryCruxRecord } from './crux.js';
import { publishGithubReport } from './github.js';
import { saveReport } from './report.js';

const EXIT_OK = 0;
const EXIT_ERROR = 2;

function formatDate(date) {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function formatCollectionPeriod(period) {
  if (!period?.firstDate || !period?.lastDate) return 'No especificado';
  return `${formatDate(period.firstDate)} a ${formatDate(period.lastDate)}`;
}

export async function publishReport(config, report, {
  writeReport = saveReport,
  publishIssue = publishGithubReport,
  log = console.log,
} = {}) {
  const saved = await writeReport(report);
  log(`Informe guardado: ${saved.markdownPath}`);
  if (config.github) {
    const url = await publishIssue(config.github, saved.markdown);
    log(`Informe publicado en GitHub: ${url}`);
    return { ...saved, githubUrl: url };
  }
  return saved;
}

export async function runMonitor(config, {
  queryRecord = queryCruxRecord,
  publish = publishReport,
  log = console.log,
  timestamp = new Date().toISOString(),
  runUrl = null,
  demo = false,
  notifyUser = null,
} = {}) {
  if (demo) {
    const report = { demo: true, timestamp, runUrl, ...(notifyUser ? { notifyUser } : {}) };
    await publish(config, report);
    log('Prueba de publicacion terminada; no se ha consultado CrUX.');
    return report;
  }

  const measurements = [];
  const unavailable = [];
  for (const origin of config.origins) {
    for (const device of config.devices) {
      log(`${origin} · ${device}`);
      const report = await queryRecord(origin, device, config.apiKey);
      const missingMetrics = report.missingMetrics ?? [];
      if (!report.available || missingMetrics.length > 0) {
        unavailable.push({ origin, device, missingMetrics: missingMetrics.length > 0 ? missingMetrics : ['LCP', 'CLS', 'INP'] });
      }
      if (!report.available) {
        log('  -> CrUX no tiene datos suficientes para este origen y dispositivo.');
        continue;
      }

      const collectionPeriod = formatCollectionPeriod(report.collectionPeriod);
      log(`  Periodo CrUX: ${collectionPeriod}`);
      if (missingMetrics.length > 0) {
        log(`  -> Sin datos suficientes para: ${missingMetrics.join(', ')}.`);
      }
      for (const metric of report.metrics) {
        const limit = config.thresholds[metric.key];
        const status = getMetricStatus(metric.key, metric.p75);
        measurements.push({ origin, device, ...metric, status, limit, collectionPeriod });
        log(`  -> ${metric.metric}: p75 ${metric.p75}${metric.unit} (${status}; umbral ${limit}${metric.unit})`);
      }
    }
  }

  const report = {
    timestamp,
    thresholds: config.thresholds,
    runUrl,
    measurements,
    unavailable,
  };

  await publish(config, report);
  log(`Informe diario generado: ${measurements.length} métrica(s), ${unavailable.length} combinación(es) con datos incompletos.`);
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--demo')) {
    throw new ConfigError('Solo se admite --demo como opcion; el envio mediante proveedores de correo se ha retirado.');
  }
  const demo = args.includes('--demo');
  const config = loadConfig(process.env, { demo });
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_EVENT_NAME, GITHUB_ACTOR } = process.env;
  const runUrl = GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
  const notifyUser = demo && GITHUB_EVENT_NAME === 'workflow_dispatch' ? GITHUB_ACTOR : null;
  await runMonitor(config, { demo, runUrl, notifyUser });
  return EXIT_OK;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof ConfigError ? `Configuración inválida: ${err.message}` : err);
      process.exit(EXIT_ERROR);
    },
  );
}
