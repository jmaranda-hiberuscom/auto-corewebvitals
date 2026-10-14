const CRUX_API_URL = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';
const FORM_FACTORS = Object.freeze({ MOBILE: 'PHONE', DESKTOP: 'DESKTOP' });
const METRICS = [
  { key: 'lcp', apiName: 'largest_contentful_paint', metric: 'LCP', unit: ' ms' },
  { key: 'cls', apiName: 'cumulative_layout_shift', metric: 'CLS', unit: '' },
  { key: 'inp', apiName: 'interaction_to_next_paint', metric: 'INP', unit: ' ms' },
];
const QUALITY_THRESHOLDS = Object.freeze({
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
});

export function getMetricStatus(key, p75) {
  const thresholds = QUALITY_THRESHOLDS[key];
  if (!thresholds) throw new Error(`Métrica CrUX no compatible: ${key}.`);
  if (p75 <= thresholds.good) return 'Good';
  if (p75 <= thresholds.poor) return 'Needs improvement';
  return 'Poor';
}

export function parseCruxResponse(payload, device) {
  const record = payload?.record;
  const recordMetrics = record?.metrics;
  if (!recordMetrics || typeof recordMetrics !== 'object') {
    return { available: false, metrics: [], missingMetrics: METRICS.map(({ metric }) => metric), collectionPeriod: null };
  }

  const metrics = [];
  const missingMetrics = [];
  for (const definition of METRICS) {
    const rawP75 = recordMetrics[definition.apiName]?.percentiles?.p75;
    if (rawP75 === undefined || rawP75 === null || rawP75 === '') {
      missingMetrics.push(definition.metric);
      continue;
    }

    const p75 = typeof rawP75 === 'number' || (typeof rawP75 === 'string' && rawP75.trim() !== '')
      ? Number(rawP75)
      : Number.NaN;
    if (!Number.isFinite(p75) || p75 < 0) {
      throw new Error(`La respuesta de CrUX no incluye un p75 válido para ${definition.metric}.`);
    }
    metrics.push({ key: definition.key, metric: definition.metric, device, p75, unit: definition.unit });
  }

  return {
    available: metrics.length > 0,
    metrics,
    missingMetrics,
    collectionPeriod: record.collectionPeriod ?? null,
  };
}

export async function queryCruxRecord(origin, device, apiKey, fetchImpl = fetch) {
  const formFactor = FORM_FACTORS[device];
  if (!formFactor) throw new Error(`Dispositivo CrUX no compatible: ${device}.`);

  const url = new URL(CRUX_API_URL);
  url.searchParams.set('key', apiKey);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin,
      formFactor,
      metrics: METRICS.map(({ apiName }) => apiName),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) {
    return { available: false, metrics: [], missingMetrics: METRICS.map(({ metric }) => metric), collectionPeriod: null };
  }
  if (!response.ok) {
    throw new Error(`La API CrUX respondió HTTP ${response.status} para ${origin} (${device}).`);
  }

  return parseCruxResponse(await response.json(), device);
}