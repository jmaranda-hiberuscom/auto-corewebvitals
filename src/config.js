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

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseList(value) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function loadConfig(env = process.env, { demo = false } = {}) {
  const originValues = parseList(env.CRUX_ORIGINS ?? '');
  if (!demo && originValues.length === 0) {
    throw new ConfigError('CRUX_ORIGINS es obligatorio (orígenes de CrUX separados por comas).');
  }
  const origins = originValues.map((origin, i) => {
    const normalized = normalizeOrigin(origin);
    if (!normalized) throw new ConfigError(`CRUX_ORIGINS: la entrada #${i + 1} no es un origen http(s) válido.`);
    return normalized;
  });

  const apiKey = env.CRUX_API_KEY?.trim();
  if (!demo && !apiKey) throw new ConfigError('CRUX_API_KEY es obligatorio.');

  const devices = parseList(env.CRUX_DEVICES?.trim() || 'MOBILE,DESKTOP').map((device) => device.toUpperCase());
  if (devices.length === 0 || devices.some((device) => !['MOBILE', 'DESKTOP'].includes(device))) {
    throw new ConfigError('CRUX_DEVICES solo admite MOBILE y/o DESKTOP.');
  }

  const repository = env.GITHUB_REPOSITORY?.trim();
  const token = env.GITHUB_TOKEN?.trim();
  let github = null;
  if (repository || token) {
    if (!token || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository ?? '')) {
      throw new ConfigError('La publicacion requiere GITHUB_REPOSITORY (owner/repo) y GITHUB_TOKEN.');
    }
    github = {
      repository,
      token,
      issueNumber: readNumber(env, 'REPORT_ISSUE_NUMBER', null, { integer: true, min: 1 }),
    };
  }

  const thresholds = {
    lcp: readNumber(env, 'MAX_LCP', 2500),
    cls: readNumber(env, 'MAX_CLS', 0.1),
    inp: readNumber(env, 'MAX_INP', 200),
  };
  return {
    origins: [...new Set(origins)],
    devices,
    apiKey,
    thresholds,
    github,
  };
}
