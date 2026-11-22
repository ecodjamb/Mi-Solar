'use strict';

const DATASTORE_HOSTS = Object.freeze({
  na: 'https://api.amazonalexa.com',
  eu: 'https://api.eu.amazonalexa.com',
  fe: 'https://api.fe.amazonalexa.com'
});

function isAlexaDeviceId(value) {
  return /^amzn1\.ask\.device\.[A-Za-z0-9._-]+$/.test(String(value || ''));
}

function isAlexaUserId(value) {
  return /^amzn1\.ask\.account\.[A-Za-z0-9._-]+$/.test(String(value || ''));
}

function normalizeDataStoreTarget(target) {
  if (isAlexaDeviceId(target)) return { type: 'DEVICES', items: [target] };
  if (isAlexaUserId(target)) return { type: 'USER', id: target };
  if (target?.type === 'DEVICES' && Array.isArray(target.items) &&
      target.items.length > 0 && target.items.length <= 20 && target.items.every(isAlexaDeviceId)) {
    return { type: 'DEVICES', items: [...new Set(target.items)] };
  }
  if (target?.type === 'USER' && isAlexaUserId(target.id)) {
    return { type: 'USER', id: target.id };
  }
  throw new Error('El destino de Data Store debe ser un deviceId o userId válido de esta Skill.');
}

function maskIdentifier(value) {
  const text = String(value || '');
  if (!text) return '(ausente)';
  return text.length <= 8 ? '***' : `${text.slice(0, 7)}…${text.slice(-5)}`;
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error'),
    code: error?.code ? String(error.code) : undefined,
    status: Number.isFinite(Number(error?.status)) ? Number(error.status) : undefined,
    message: String(error?.message || 'Error sin detalle').slice(0, 180)
  };
}

async function jsonOrError(response) {
  const body = await response.text();
  if (!response.ok) {
    const error = new Error(`Alexa Data Store HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Alexa Data Store devolvió una respuesta JSON inválida.');
    error.status = response.status;
    throw error;
  }
}

function failedDeliveries(result) {
  const results = Array.isArray(result?.results) ? result.results : [];
  const items = Array.isArray(result?.items) ? result.items : [];
  return [
    ...results.filter(item => item?.type && item.type !== 'SUCCESS'),
    ...items.filter(item => item?.type && item.type !== 'SUCCESS')
  ];
}

async function writeDataStore(snapshot, targetInput, {
  fetchImpl = globalThis.fetch,
  now = new Date()
} = {}) {
  const target = normalizeDataStoreTarget(targetInput);
  if (typeof fetchImpl !== 'function') throw new Error('fetch no está disponible en la Lambda.');

  const clientId = process.env.ALEXA_LWA_CLIENT_ID;
  const clientSecret = process.env.ALEXA_LWA_CLIENT_SECRET;
  const region = process.env.ALEXA_API_REGION || 'na';
  const host = DATASTORE_HOSTS[region];
  if (!clientId || !clientSecret || !host) {
    throw new Error('Credenciales LWA o región de Alexa Data Store incompletas.');
  }

  const lwa = await jsonOrError(await fetchImpl('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'alexa::datastore'
    })
  }));
  if (!lwa.access_token) throw new Error('LWA no devolvió un access_token para Alexa Data Store.');

  const result = await jsonOrError(await fetchImpl(`${host}/v1/datastore/commands`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lwa.access_token}`
    },
    body: JSON.stringify({
      commands: [{
        type: 'PUT_OBJECT',
        namespace: 'MiSolar',
        key: 'Indicadores',
        content: snapshot
      }],
      target,
      attemptDeliveryUntil: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    })
  }));

  const failures = failedDeliveries(result);
  if (failures.length) {
    const error = new Error(`Alexa rechazó la entrega: ${failures.map(item => item.type).join(', ')}`);
    error.code = 'DATASTORE_DELIVERY_FAILED';
    error.failures = failures.map(item => ({ type: item.type, deviceId: maskIdentifier(item.deviceId) }));
    throw error;
  }
  return {
    accepted: true,
    queuedResultId: result?.queuedResultId || null,
    results: Array.isArray(result?.results) ? result.results.length : 0
  };
}

module.exports = {
  DATASTORE_HOSTS,
  failedDeliveries,
  isAlexaDeviceId,
  isAlexaUserId,
  maskIdentifier,
  normalizeDataStoreTarget,
  safeError,
  writeDataStore
};
