export class ConfigError extends Error {}

function readNumber(env, name, fallback, { integer = false, min = 0 } = {}) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  const valid = integer ? Number.isInteger(value) && value >= min : Number.isFinite(value) && value > min;
  if (!valid) {
    throw new ConfigError(`${name} debe ser un número ${integer ? `entero >= ${min}` : `> ${min}`} (recibido: "${raw}")`);
  }
  return value;
}

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function loadConfig(env = process.env) {
  const urls = [...new Set((env.URLS_TO_CHECK ?? '').split(',').map((u) => u.trim()).filter(Boolean))];
  if (urls.length === 0) {
    throw new ConfigError('URLS_TO_CHECK es obligatorio (lista de URLs separadas por comas).');
  }
  urls.forEach((url, i) => {
    if (!isHttpUrl(url)) throw new ConfigError(`URLS_TO_CHECK: la entrada #${i + 1} no es una URL http(s) válida.`);
  });

  // The webhook URL is a secret: never echo it in error messages.
  const webhookUrl = env.WEBHOOK_URL?.trim() || null;
  if (webhookUrl && !isHttpUrl(webhookUrl)) {
    throw new ConfigError('WEBHOOK_URL no es una URL http(s) válida.');
  }

  return {
    urls,
    webhookUrl,
    thresholds: {
      lcp: readNumber(env, 'MAX_LCP', 2500),
      cls: readNumber(env, 'MAX_CLS', 0.1),
      inp: readNumber(env, 'MAX_INP', 200),
    },
    runsPerUrl: readNumber(env, 'RUNS_PER_URL', 3, { integer: true, min: 1 }),
  };
}
