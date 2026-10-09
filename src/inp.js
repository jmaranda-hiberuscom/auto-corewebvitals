import { DEVICE, THROTTLING } from './emulation.js';
import { inpFromLatencies } from './stats.js';

// Disclosure widgets (hamburger menus, accordions, dropdowns): the usual mobile INP hotspots,
// and safe to tap on production because they don't navigate or submit anything.
const SAFE_TOGGLES = 'button[aria-expanded], [role="button"][aria-expanded]:not([href]), details > summary';
const MAX_TAPS = 3;

// Runs in the page before any site script; keeps the worst latency per interactionId (Event Timing API).
function installInteractionObserver() {
  const latencies = {};
  const record = (list) => {
    for (const entry of list.getEntries()) {
      if (!entry.interactionId) continue;
      latencies[entry.interactionId] = Math.max(latencies[entry.interactionId] ?? 0, entry.duration);
    }
  };
  new PerformanceObserver(record).observe({ type: 'event', durationThreshold: 16, buffered: true });
  new PerformanceObserver(record).observe({ type: 'first-input', buffered: true });
  Object.defineProperty(window, '__cwvInteractionLatencies', { value: () => Object.values(latencies) });
}

/**
 * Lighthouse navigation audits cannot measure INP (it needs real interactions), so it is measured
 * here: throttled mobile page + scripted taps/keys + Event Timing. Returns INP in ms, or null.
 */
export async function measureInp(browser, url) {
  const context = await browser.newContext({ ...DEVICE });
  try {
    const page = await context.newPage();
    await page.addInitScript(installInteractionObserver);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: THROTTLING.requestLatencyMs,
      downloadThroughput: (THROTTLING.downloadThroughputKbps * 1024) / 8,
      uploadThroughput: (THROTTLING.uploadThroughputKbps * 1024) / 8,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLING.cpuSlowdownMultiplier });

    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    let inp = null;
    const collect = async () => {
      await page.waitForTimeout(500); // Event Timing entries are delivered after the next paint.
      const latencies = await page.evaluate(() => window.__cwvInteractionLatencies?.() ?? []).catch(() => []);
      const value = inpFromLatencies(latencies);
      if (value !== null) inp = Math.max(inp ?? 0, value);
    };

    let taps = 0;
    for (const toggle of await page.locator(SAFE_TOGGLES).filter({ visible: true }).all()) {
      if (taps >= MAX_TAPS) break;
      const submitsForm = await toggle.evaluate((el) => el.type === 'submit' && !!el.form).catch(() => true);
      if (submitsForm) continue;
      try {
        await toggle.tap({ timeout: 3_000 });
        taps++;
        await collect();
      } catch {
        // Covered by an overlay or hidden by a previous toggle: try the next one.
      }
    }

    await page.keyboard.press('Tab');
    await collect();
    return inp;
  } finally {
    await context.close();
  }
}
