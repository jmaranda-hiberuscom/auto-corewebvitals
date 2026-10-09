export const STANDARD_THRESHOLDS = Object.freeze({ lcp: 2500, cls: 0.1, inp: 200 });

const METRICS = [
  { key: 'lcp', label: 'LCP', pattern: /\bLCP\b|largest contentful paint/i },
  { key: 'cls', label: 'CLS', pattern: /\bCLS\b|cumulative layout shift/i },
  { key: 'inp', label: 'INP', pattern: /\bINP\b|interaction to next paint/i },
];

const NON_GOOD = /\bpoor\b|needs? improvement|not good|\bissue\b|longer than|more than/i;
const GSC_REPORT = 'https://search.google.com/search-console/core-web-vitals';

export function validateGscThresholds(thresholds) {
  for (const { key, label } of METRICS) {
    if (thresholds[key] !== STANDARD_THRESHOLDS[key]) {
      throw new Error(
        `${label}: Search Console solo permite clasificar issues con su límite estándar (${STANDARD_THRESHOLDS[key]}${key === 'cls' ? '' : ' ms'}); no se puede comparar un presupuesto personalizado con el p75 exacto.`,
      );
    }
  }
}

function reportedBoundary(line, metricKey) {
  const match = line.match(/(?:longer than|more than|greater than|over)\s*([\d,.]+)\s*(ms|milliseconds?|s|seconds?)?/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const unit = match[2]?.toLowerCase();
  if (unit?.startsWith('s') && metricKey === 'lcp') return value * 1000;
  return value;
}

export function parseGscIssueRows(rows, device) {
  const issues = [];
  for (const rawRow of rows) {
    const text = rawRow.replace(/\s+/g, ' ').trim();
    if (!text || !NON_GOOD.test(text)) continue;

    const metric = METRICS.find(({ pattern }) => pattern.test(text));
    if (!metric) continue;

    const status = /\bpoor\b/i.test(text)
      ? 'Poor'
      : /needs? improvement/i.test(text)
        ? 'Needs improvement'
        : 'Exceeds good threshold';

    issues.push({
      key: metric.key,
      metric: metric.label,
      device,
      status,
      reportedBoundary: reportedBoundary(text, metric.key),
      issueText: text,
    });
  }
  return issues;
}

export function parseGscReportText(text, device) {
  if (/no data available|not enough data/i.test(text)) {
    return { available: false, issues: [] };
  }
  return { available: true, issues: parseGscIssueRows(text.split(/\r?\n/), device) };
}

export async function scrapeGscDeviceReport(context, property, device) {
  const page = await context.newPage();
  try {
    const reportUrl = new URL(GSC_REPORT);
    reportUrl.searchParams.set('resource_id', property);
    reportUrl.searchParams.set('hl', 'en');
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    if (new URL(page.url()).hostname === 'accounts.google.com') {
      throw new Error('La sesión de Search Console expiró; renueva el estado con npm run auth.');
    }

    const body = page.locator('body');
    await body.getByText(/core web vitals/i).first().waitFor({ timeout: 45_000 }).catch(() => {});
    const textBeforeClick = await body.innerText();
    if (/sign in to continue|sign in to search console/i.test(textBeforeClick)) {
      throw new Error('Search Console requiere iniciar sesión; renueva el estado con npm run auth.');
    }

    const reportIndex = device === 'MOBILE' ? 0 : 1;
    const candidates = [
      page.getByRole('link', { name: /open report/i }),
      page.getByRole('button', { name: /open report/i }),
      page.getByText(/^open report$/i),
    ];
    let openReports;
    let count = 0;
    for (const candidate of candidates) {
      const candidateCount = await candidate.count();
      if (candidateCount > reportIndex) {
        openReports = candidate;
        count = candidateCount;
        break;
      }
    }
    if (count <= reportIndex) {
      throw new Error(`No se encontró el acceso al informe de ${device} en Search Console.`);
    }

    const cardTexts = await openReports.evaluateAll((elements) => elements.map((element) => {
      let parent = element;
      for (let depth = 0; parent && depth < 7; depth++, parent = parent.parentElement) {
        const text = parent.innerText ?? '';
        if (text.length <= 600 && /\b(mobile|desktop)\b/i.test(text)) return text;
      }
      return '';
    }));
    const deviceIndex = cardTexts.findIndex((text) => new RegExp(`\\b${device.toLowerCase()}\\b`, 'i').test(text));
    await openReports.nth(deviceIndex >= 0 ? deviceIndex : reportIndex).click({ timeout: 10_000 });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.locator('[role="row"], tr').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

    const text = await body.innerText();
    const rows = await page.locator('[role="row"], tr').allInnerTexts();
    const parsed = parseGscReportText(text, device);
    if (!parsed.available) return parsed;

    let issues = parseGscIssueRows(rows, device);
    if (issues.length === 0) issues = parsed.issues;
    if (issues.length === 0 && !/\bgood\b|no issues|all urls/i.test(text)) {
      throw new Error(`No se pudo interpretar la tabla de Core Web Vitals para ${device}; la interfaz de Search Console pudo haber cambiado.`);
    }
    return { available: true, issues };
  } finally {
    await page.close();
  }
}