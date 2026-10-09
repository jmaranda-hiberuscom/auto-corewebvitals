import lighthouse from 'lighthouse';
import { DEVICE, THROTTLING } from './emulation.js';

function numericAudit(lhr, id) {
  const audit = lhr.audits[id];
  if (typeof audit?.numericValue !== 'number') {
    throw new Error(`Lighthouse no pudo calcular ${id}: ${audit?.errorMessage ?? 'sin datos'}`);
  }
  return audit.numericValue;
}

/** Runs a performance-only Lighthouse audit on the Chromium listening on `port`. Returns LCP (ms) and CLS. */
export async function runLighthouse(url, port) {
  const result = await lighthouse(
    url,
    { port, hostname: '127.0.0.1', logLevel: 'error' },
    {
      extends: 'lighthouse:default',
      settings: {
        onlyCategories: ['performance'],
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: DEVICE.viewport.width,
          height: DEVICE.viewport.height,
          deviceScaleFactor: DEVICE.deviceScaleFactor,
          disabled: false,
        },
        emulatedUserAgent: DEVICE.userAgent,
        throttlingMethod: 'simulate',
        throttling: THROTTLING,
        disableFullPageScreenshot: true,
      },
    },
  );

  const lhr = result?.lhr;
  if (!lhr) throw new Error('Lighthouse no devolvió resultados.');
  if (lhr.runtimeError) throw new Error(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);

  return {
    lcp: numericAudit(lhr, 'largest-contentful-paint'),
    cls: numericAudit(lhr, 'cumulative-layout-shift'),
  };
}
