'use strict';

// Controlador autocontenido para Alexa-hosted. Las credenciales se leen desde
// variables seguras o desde la tabla DynamoDB cifrada de la Skill; nunca se
// incluyen en este archivo ni se escriben en los registros.
const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const https = require('node:https');

const PUBLIC_MONITOR_URL = 'https://misolar.vercel.app/api/public/monitor';
const SITE_KEY = 'site:2';
const SITE_NAME = 'El Arrayán';
const DATASTORE_HOSTS = {
  na: 'https://api.amazonalexa.com',
  eu: 'https://api.eu.amazonalexa.com',
  fe: 'https://api.fe.amazonalexa.com'
};
const STALE_AFTER_MS = 15 * 60 * 1000;
const CREDENTIALS_TABLE = process.env.DYNAMODB_PERSISTENCE_TABLE_NAME ||
  '9e1ed70e-6b0d-426a-acbd-a4666b40751b';
const CREDENTIALS_KEY = 'alexa-widget-credentials';
const TARGETS_KEY = 'alexa-widget-targets';
const documentClient = new AWS.DynamoDB.DocumentClient();
let lastValidSnapshot = null;
let dataStoreCredentialCache = null;
let lwaTokenCache = null;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatKw(watts) {
  return `${(number(watts) / 1000).toFixed(1).replace('.', ',')} kW`;
}

function formatKwh(value) {
  return Number.isFinite(Number(value))
    ? `${Number(value).toFixed(1).replace('.', ',')} kWh`
    : '--';
}

function formatTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '--:--';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(timestamp));
}

function isStale(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  const age = Date.now() - timestamp;
  return age < -120000 || age > STALE_AFTER_MS;
}

function maskIdentifier(value) {
  const text = String(value || '');
  return text.length > 12 ? `${text.slice(0, 7)}…${text.slice(-5)}` : '(ausente)';
}

function deviceIdFromEnvelope(envelope) {
  const deviceId = envelope && envelope.context && envelope.context.System &&
    envelope.context.System.device && envelope.context.System.device.deviceId;
  return /^amzn1\.ask\.device\.[A-Za-z0-9._-]+$/.test(String(deviceId || ''))
    ? deviceId
    : null;
}

function userIdFromEnvelope(envelope) {
  const userId = envelope && envelope.context && envelope.context.System &&
    envelope.context.System.user && envelope.context.System.user.userId;
  const text = String(userId || '');
  return /^amzn1\.ask\.account\.[A-Za-z0-9._-]+$/.test(text) ? text : null;
}

function targetFromEnvelope(envelope) {
  const deviceId = deviceIdFromEnvelope(envelope);
  if (deviceId) return { type: 'DEVICES', items: [deviceId] };
  const userId = userIdFromEnvelope(envelope);
  return userId ? { type: 'USER', id: userId } : null;
}

async function rememberTarget(envelope) {
  const deviceId = deviceIdFromEnvelope(envelope);
  const userId = userIdFromEnvelope(envelope);
  if (!deviceId && !userId) return;
  const expressionNames = {};
  const expressionValues = { ':updatedAt': new Date().toISOString() };
  const updates = ['updatedAt = :updatedAt'];
  if (deviceId) {
    expressionNames['#deviceId'] = 'deviceId';
    expressionValues[':deviceId'] = deviceId;
    updates.push('#deviceId = :deviceId');
  }
  if (userId) {
    expressionNames['#userId'] = 'userId';
    expressionValues[':userId'] = userId;
    updates.push('#userId = :userId');
  }
  const params = {
    TableName: CREDENTIALS_TABLE,
    Key: { id: TARGETS_KEY },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: expressionValues
  };
  if (Object.keys(expressionNames).length) params.ExpressionAttributeNames = expressionNames;
  await documentClient.update(params).promise();
  console.log('MiSolar: destino de Data Store guardado', {
    table: CREDENTIALS_TABLE,
    hasDeviceId: Boolean(deviceId),
    hasUserId: Boolean(userId)
  });
}

async function rememberTargetSafely(envelope) {
  try {
    await rememberTarget(envelope);
  } catch (error) {
    console.error('MiSolar: no fue posible guardar el destino de Data Store', {
      name: String(error && error.name || 'Error'),
      message: String(error && error.message || 'Error sin detalle').slice(0, 180)
    });
  }
}

function generatedTodayKwh(site) {
  return (Array.isArray(site && site.history) ? site.history : []).reduce((total, row) => {
    const hours = Math.max(0, number(row && row.aggregateHours));
    const watts = Math.max(0, number(row && row.pvInputPower1)) +
      Math.max(0, number(row && row.pvInputPower2));
    return total + watts * hours / 1000;
  }, 0);
}

function buildSnapshot(payload) {
  const sites = Array.isArray(payload && payload.sites) ? payload.sites : [];
  const site = sites.find(item => item && item.key === SITE_KEY) ||
    sites.find(item => item && item.name === SITE_NAME);
  if (!site || !site.available || !site.realtime || !site.sampledAt) {
    throw new Error('La fuente pública no contiene una muestra disponible de El Arrayán.');
  }

  const realtime = site.realtime;
  const pv1 = Math.max(0, number(realtime.pvInputPower1));
  const pv2 = Math.max(0, number(realtime.pvInputPower2));
  const imported = Math.max(0, number(realtime.gridPowerInputActiveTotal));
  const exported = Math.max(0, number(realtime.gridPowerOutputActiveTotal));
  const generated = generatedTodayKwh(site);
  const expected = Number(site.forecastTodayKwh);
  const hasForecast = Number.isFinite(expected) && expected > 0;
  const progress = hasForecast
    ? Math.max(0, Math.min(100, Math.round(generated / expected * 100)))
    : 0;

  return {
    sitio: SITE_NAME,
    generacion: formatKw(pv1 + pv2),
    pv1: formatKw(pv1),
    pv2: formatKw(pv2),
    consumo: formatKw(realtime.acOutputActivePowerTotal),
    bateria: `${Math.max(0, Math.min(100, Math.round(number(realtime.batteryCapacity))))} %`,
    bateriaValor: Math.max(0, Math.min(100, Math.round(number(realtime.batteryCapacity)))),
    red: formatKw(Math.max(imported, exported)),
    redDireccion: imported > 50
      ? 'IMPORTANDO DE LA RED'
      : exported > 50 ? 'EXPORTANDO A LA RED' : 'SIN INTERCAMBIO',
    generadoHoy: formatKwh(generated),
    esperadoHoy: hasForecast ? formatKwh(expected) : '--',
    progresoSolar: `${progress}%`,
    progresoSolarValor: progress,
    tienePronostico: hasForecast,
    estado: isStale(site.sampledAt) ? 'Dato atrasado' : 'Actualizado',
    hora: formatTime(site.sampledAt),
    origen: String(site.provider || '--'),
    disponible: true,
    sampledAt: site.sampledAt,
    version: '1.0.12'
  };
}

function requestJson(url, {
  method = 'GET',
  headers = {},
  body = null,
  timeoutMs = 6500,
  label = 'HTTP'
} = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`${label} HTTP ${response.statusCode}`);
          error.status = response.statusCode;
          reject(error);
          return;
        }
        try {
          resolve(text ? JSON.parse(text) : {});
        } catch {
          reject(new Error(`${label} devolvió JSON inválido.`));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`${label} agotó el tiempo de espera.`)));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function fetchSnapshot() {
  try {
    const payload = await requestJson(PUBLIC_MONITOR_URL, {
      headers: { Accept: 'application/json' },
      label: 'Mi Solar'
    });
    lastValidSnapshot = buildSnapshot(payload);
    return lastValidSnapshot;
  } catch (error) {
    if (lastValidSnapshot) {
      return { ...lastValidSnapshot, estado: 'Último dato válido' };
    }
    throw error;
  }
}

async function dataStoreCredentials() {
  if (dataStoreCredentialCache) return dataStoreCredentialCache;
  const envClientId = process.env.ALEXA_LWA_CLIENT_ID;
  const envClientSecret = process.env.ALEXA_LWA_CLIENT_SECRET;
  if (envClientId && envClientSecret) {
    dataStoreCredentialCache = { clientId: envClientId, clientSecret: envClientSecret };
    return dataStoreCredentialCache;
  }
  const result = await documentClient.get({
    TableName: CREDENTIALS_TABLE,
    Key: { id: CREDENTIALS_KEY },
    ProjectionExpression: 'clientId, clientSecret'
  }).promise();
  const clientId = result && result.Item && result.Item.clientId;
  const clientSecret = result && result.Item && result.Item.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error('Faltan credenciales de Alexa Data Store en el almacén cifrado de la Skill.');
  }
  dataStoreCredentialCache = { clientId, clientSecret };
  return dataStoreCredentialCache;
}

async function dataStoreAccessToken() {
  if (lwaTokenCache && lwaTokenCache.expiresAt > Date.now() + 60000) {
    return lwaTokenCache.token;
  }
  const { clientId, clientSecret } = await dataStoreCredentials();
  const tokenBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'alexa::datastore'
  }).toString();
  const tokenPayload = await requestJson('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(tokenBody)
    },
    body: tokenBody,
    label: 'LWA'
  });
  if (!tokenPayload.access_token) throw new Error('LWA no devolvió un token de Data Store.');
  lwaTokenCache = {
    token: tokenPayload.access_token,
    expiresAt: Date.now() + Math.max(60, number(tokenPayload.expires_in, 3600)) * 1000
  };
  return lwaTokenCache.token;
}

async function writeDataStore(snapshot, target) {
  const region = process.env.ALEXA_API_REGION || 'na';
  const host = DATASTORE_HOSTS[region];
  if (!host) throw new Error('Región de Alexa Data Store inválida.');
  const accessToken = await dataStoreAccessToken();

  const commandBody = JSON.stringify({
    commands: [{
      type: 'PUT_OBJECT',
      namespace: 'MiSolar',
      key: 'Indicadores',
      content: snapshot
    }],
    target,
    attemptDeliveryUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  return requestJson(`${host}/v1/datastore/commands`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(commandBody),
      Authorization: `Bearer ${accessToken}`
    },
    body: commandBody,
    label: 'Alexa Data Store'
  });
}

async function syncTarget(target) {
  if (!target) {
    console.warn('MiSolar: evento sin destino Alexa válido.');
    return null;
  }
  try {
    const snapshot = await fetchSnapshot();
    const result = await writeDataStore(snapshot, target);
    const deliveryTypes = Array.isArray(result && result.results)
      ? result.results.map((item) => String(item && item.type || 'UNKNOWN')).slice(0, 20)
      : [];
    const accepted = Boolean(result && result.queuedResultId) ||
      deliveryTypes.includes('SUCCESS');
    if (deliveryTypes.length > 0 && !accepted) {
      throw new Error(`Alexa Data Store rechazó la entrega: ${deliveryTypes.join(', ')}`);
    }
    const targetId = target.type === 'DEVICES' ? target.items[0] : target.id;
    console.log('MiSolar: Data Store aceptó la muestra', {
      targetType: target.type,
      target: maskIdentifier(targetId),
      sampledAt: snapshot.sampledAt,
      estado: snapshot.estado,
      queuedResultId: result && result.queuedResultId ? 'presente' : 'ausente',
      delivery: deliveryTypes.length > 0 ? deliveryTypes : ['QUEUED']
    });
    return snapshot;
  } catch (error) {
    console.error('MiSolar: sincronización fallida', {
      name: String(error && error.name || 'Error'),
      status: Number.isFinite(Number(error && error.status)) ? Number(error.status) : undefined,
      message: String(error && error.message || 'Error sin detalle').slice(0, 180)
    });
    return null;
  }
}

const InstalledHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) ===
      'Alexa.DataStore.PackageManager.UsagesInstalled';
  },
  async handle(input) {
    await rememberTargetSafely(input.requestEnvelope);
    const target = targetFromEnvelope(input.requestEnvelope);
    console.log('MiSolar: instalación detectada', {
      targetType: target && target.type,
      target: maskIdentifier(target && (target.items ? target.items[0] : target.id))
    });
    await syncTarget(target);
    return input.responseBuilder.getResponse();
  }
};

const UpdatedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) ===
      'Alexa.DataStore.PackageManager.UpdateRequest';
  },
  async handle(input) {
    await rememberTargetSafely(input.requestEnvelope);
    await syncTarget(targetFromEnvelope(input.requestEnvelope));
    return input.responseBuilder.getResponse();
  }
};

const RemovedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) ===
      'Alexa.DataStore.PackageManager.UsagesRemoved';
  },
  handle(input) {
    console.log('MiSolar: desinstalación detectada', {
      target: maskIdentifier(deviceIdFromEnvelope(input.requestEnvelope))
    });
    return input.responseBuilder.getResponse();
  }
};

const LaunchHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'LaunchRequest';
  },
  async handle(input) {
    await rememberTargetSafely(input.requestEnvelope);
    const snapshot = await syncTarget(targetFromEnvelope(input.requestEnvelope));
    return input.responseBuilder
      .speak(snapshot
        ? `Mi Solar actualizó el widget. Producción solar ${snapshot.generacion}, batería ${snapshot.bateria}.`
        : 'Mi Solar está listo, pero no pudo actualizar el widget en este momento.')
      .getResponse();
  }
};

const HelpHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest';
  },
  handle(input) {
    return input.responseBuilder
      .speak('Puedes ver la producción solar y las baterías desde el widget Mi Solar.')
      .getResponse();
  }
};

const AuxiliaryEventHandler = {
  canHandle() {
    return true;
  },
  handle(input) {
    console.log('MiSolar: evento auxiliar atendido', {
      type: Alexa.getRequestType(input.requestEnvelope)
    });
    return input.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(input, error) {
    console.error('MiSolar: error controlado', {
      name: String(error && error.name || 'Error'),
      message: String(error && error.message || 'Error sin detalle').slice(0, 180)
    });
    return input.responseBuilder
      .speak('Mi Solar está temporalmente no disponible.')
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    InstalledHandler,
    UpdatedHandler,
    RemovedHandler,
    LaunchHandler,
    HelpHandler,
    AuxiliaryEventHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
