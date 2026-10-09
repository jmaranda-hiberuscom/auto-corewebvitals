const METRICS = [
  { key: 'lcp', label: 'LCP', unit: 'ms', decimals: 0 },
  { key: 'cls', label: 'CLS', unit: '', decimals: 3 },
  { key: 'inp', label: 'INP', unit: 'ms', decimals: 0 },
];

const round = (value, decimals) => Number(value.toFixed(decimals));

export function describeMetrics(metrics) {
  return METRICS.map(({ key, label, unit, decimals }) =>
    `${label} ${metrics[key] == null ? 'n/d' : `${round(metrics[key], decimals)}${unit}`}`,
  ).join(' · ');
}

/** Returns one violation per metric strictly above its limit (compared on the displayed, rounded value). */
export function evaluateBudget(metrics, thresholds) {
  return METRICS.flatMap(({ key, label, unit, decimals }) => {
    if (metrics[key] == null) return [];
    const value = round(metrics[key], decimals);
    const limit = thresholds[key];
    if (value <= limit) return [];
    return [{ metric: label, value, limit, unit, message: `${label} obtenido: ${value}${unit} | Límite: ${limit}${unit}` }];
  });
}
