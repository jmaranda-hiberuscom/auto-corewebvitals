import { devices } from 'playwright';

export const DEVICE_NAME = 'Moto G4';
export const DEVICE = devices[DEVICE_NAME];

// Lighthouse / PageSpeed Insights default mobile profile ("Slow 4G", ~bottom quartile of 4G connections).
// rtt/throughput feed Lighthouse's simulated throttling; request*/download*/upload* are the
// equivalent DevTools values (RTT x3.75, throughput x0.9) applied via CDP in the INP session.
export const THROTTLING = {
  rttMs: 150,
  throughputKbps: 1638.4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1474.56,
  uploadThroughputKbps: 675,
  cpuSlowdownMultiplier: 4,
};

export const PROFILE_LABEL =
  `${DEVICE_NAME} · 4G (RTT ${THROTTLING.rttMs} ms, ${(THROTTLING.throughputKbps / 1024).toFixed(1)} Mbps)` +
  ` · CPU ${THROTTLING.cpuSlowdownMultiplier}x`;
