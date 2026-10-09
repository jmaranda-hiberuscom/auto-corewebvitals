import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { buildText, sendAlert } from './alert.js';
import { describeMetrics, evaluateBudget } from './budget.js';
import { ConfigError, loadConfig } from './config.js';
import { PROFILE_LABEL } from './emulation.js';
import { measureInp } from './inp.js';
import { runLighthouse } from './lighthouse.js';
import { median } from './stats.js';

const EXIT_OK = 0;
const EXIT_BUDGET_EXCEEDED = 1;
const EXIT_ERROR = 2;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function auditUrl(browser, port, url, runs) {
  const samples = [];
  let lastError = null;
  for (let run = 1; run <= runs; run++) {
    try {
      const { lcp, cls } = await runLighthouse(url, port);
      const inp = await measureInp(browser, url);
      samples.push({ lcp, cls, inp });
      console.log(`  [${run}/${runs}] ${describeMetrics({ lcp, cls, inp })}`);
    } catch (err) {
      lastError = err.message;
      console.error(`  [${run}/${runs}] error: ${err.message}`);
    }
  }
  if (samples.length === 0) return { error: lastError, metrics: null };
  return {
    error: null,
    metrics: {
      lcp: median(samples.map((s) => s.lcp)),
      cls: median(samples.map((s) => s.cls)),
      inp: median(samples.map((s) => s.inp)),
    },
  };
}

async function main() {
  const config = loadConfig();
  const timestamp = new Date().toISOString();
  const port = await getFreePort();
  const browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${port}`] });

  const failures = [];
  try {
    for (const url of config.urls) {
      console.log(url);
      const { error, metrics } = await auditUrl(browser, port, url, config.runsPerUrl);
      const violations = metrics ? evaluateBudget(metrics, config.thresholds) : [];
      const failed = Boolean(error) || violations.length > 0;
      console.log(`  -> ${failed ? 'FALLIDO' : 'OK'}${metrics ? ` (mediana: ${describeMetrics(metrics)})` : ''}`);
      if (failed) failures.push({ url, error, metrics, violations });
    }
  } finally {
    await browser.close();
  }

  if (failures.length === 0) return EXIT_OK;

  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const report = {
    timestamp,
    profile: PROFILE_LABEL,
    thresholds: config.thresholds,
    runUrl: GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : null,
    failures,
  };

  if (config.webhookUrl) {
    await sendAlert(config.webhookUrl, report);
    console.log(`Alerta enviada: ${failures.length} URL(s) fuera de presupuesto.`);
  } else {
    console.warn(`WEBHOOK_URL no configurado; la alerta no se ha enviado:\n${buildText(report)}`);
  }
  return EXIT_BUDGET_EXCEEDED;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof ConfigError ? `Configuración inválida: ${err.message}` : err);
    process.exit(EXIT_ERROR);
  },
);
