export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** INP = worst interaction latency, ignoring the single highest one for every 50 interactions (p98). */
export function inpFromLatencies(latencies) {
  if (latencies.length === 0) return null;
  const sorted = [...latencies].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length / 50))];
}
