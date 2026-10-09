import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { ConfigError, loadConfig } from './config.js';
import { sendEmail } from './email.js';
import { scrapeGscDeviceReport } from './gsc.js';

const EXIT_OK = 0;
const EXIT_ERROR = 2;

async function loadStorageState(config) {
  try {
    const serialized = config.storageStateBase64
      ? Buffer.from(config.storageStateBase64, 'base64').toString('utf8')
      : await readFile(config.storageStatePath, 'utf8');
    return JSON.parse(serialized);
  } catch {
    throw new ConfigError('No se pudo cargar la sesión de Search Console. Ejecuta npm run auth localmente y configura el estado en GitHub Secrets.');
  }
}

async function main() {
  const config = loadConfig();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: await loadStorageState(config) });
  const alerts = [];
  try {
    for (const property of config.properties) {
      for (const device of config.devices) {
        console.log(`${property} · ${device}`);
        const report = await scrapeGscDeviceReport(context, property, device);
        if (!report.available) {
          console.log('  -> Sin datos suficientes en Search Console.');
          continue;
        }

        if (report.issues.length === 0) {
          console.log('  -> Sin issues sobre los umbrales estándar.');
          continue;
        }

        for (const issue of report.issues) {
          alerts.push({
            property,
            device,
            ...issue,
            limit: config.thresholds[issue.key],
            unit: issue.key === 'cls' ? '' : ' ms',
          });
          console.log(`  -> ${issue.metric}: ${issue.status} (${issue.issueText})`);
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (alerts.length === 0) return EXIT_OK;

  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const report = {
    timestamp: new Date().toISOString(),
    thresholds: config.thresholds,
    runUrl: GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null,
    alerts,
  };

  await sendEmail(config, report);
  console.log(`Email enviado: ${alerts.length} issue(s) sobre el umbral.`);
  return EXIT_OK;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof ConfigError ? `Configuración inválida: ${err.message}` : err);
    process.exit(EXIT_ERROR);
  },
);
