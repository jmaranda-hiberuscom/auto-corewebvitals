import { validateGscThresholds } from './gsc.js';

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

function parseList(value) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function validProperty(property) {
  if (property.startsWith('sc-domain:')) return /^[a-z0-9.-]+$/i.test(property.slice('sc-domain:'.length));
  return isHttpUrl(property);
}

export function loadConfig(env = process.env) {
  const properties = parseList(env.GSC_PROPERTIES ?? '');
  if (properties.length === 0) {
    throw new ConfigError('GSC_PROPERTIES es obligatorio (propiedades de Search Console separadas por comas).');
  }
  properties.forEach((property, i) => {
    if (!validProperty(property)) throw new ConfigError(`GSC_PROPERTIES: la entrada #${i + 1} no es una propiedad válida.`);
  });

  const devices = parseList(env.GSC_DEVICES?.trim() || 'MOBILE,DESKTOP').map((device) => device.toUpperCase());
  if (devices.length === 0 || devices.some((device) => !['MOBILE', 'DESKTOP'].includes(device))) {
    throw new ConfigError('GSC_DEVICES solo admite MOBILE y/o DESKTOP.');
  }

  const storageStateBase64 = env.GSC_STORAGE_STATE_BASE64?.trim() || null;
  const storageStatePath = env.GSC_STORAGE_STATE_PATH?.trim() || '.auth/gsc-storage-state.json';
  if (!storageStateBase64 && !storageStatePath) throw new ConfigError('Configura GSC_STORAGE_STATE_BASE64 o GSC_STORAGE_STATE_PATH.');
  if (storageStateBase64) {
    try {
      const state = JSON.parse(Buffer.from(storageStateBase64, 'base64').toString('utf8'));
      if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw new Error('invalid state');
    } catch {
      throw new ConfigError('GSC_STORAGE_STATE_BASE64 no contiene un estado Playwright válido.');
    }
  }

  const emailApiKey = env.EMAIL_API_KEY?.trim();
  const emailApiUrl = env.EMAIL_API_URL?.trim() || 'https://api.resend.com/emails';
  const emailFrom = env.EMAIL_FROM?.trim();
  const emailTo = parseList(env.EMAIL_TO ?? '');
  if (!emailApiKey || !emailFrom || emailTo.length === 0) {
    throw new ConfigError('EMAIL_API_KEY, EMAIL_FROM y EMAIL_TO son obligatorios para enviar alertas por correo.');
  }
  if (!isHttpUrl(emailApiUrl)) throw new ConfigError('EMAIL_API_URL debe ser una URL http(s) válida.');
  if (emailTo.some((address) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))) {
    throw new ConfigError('EMAIL_TO debe contener direcciones de correo separadas por comas.');
  }

  const thresholds = {
    lcp: readNumber(env, 'MAX_LCP', 2500),
    cls: readNumber(env, 'MAX_CLS', 0.1),
    inp: readNumber(env, 'MAX_INP', 200),
  };
  try {
    validateGscThresholds(thresholds);
  } catch (error) {
    throw new ConfigError(error.message);
  }

  return {
    properties,
    devices,
    storageStateBase64,
    storageStatePath,
    thresholds,
    email: { apiKey: emailApiKey, apiUrl: emailApiUrl, from: emailFrom, to: emailTo },
  };
}
