'use strict';

/**
 * Código para la Skill Alexa-hosted (Node.js) de prueba.
 * Instalar la dependencia ask-sdk-core en el proyecto de Amazon,
 * no en la app Vite de Mi Solar.
 */
const Alexa = require('ask-sdk-core');
const { syncMonitorToDataStore } = require('./monitor-sync.cjs');

const hosts = {
  na: 'https://api.amazonalexa.com',
  eu: 'https://api.eu.amazonalexa.com',
  fe: 'https://api.fe.amazonalexa.com'
};

async function jsonOrError(response) {
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
  return body ? JSON.parse(body) : {};
}

async function writeDataStore(snapshot, targetId) {
  const clientId = process.env.ALEXA_LWA_CLIENT_ID;
  const clientSecret = process.env.ALEXA_LWA_CLIENT_SECRET;
  const host = hosts[process.env.ALEXA_API_REGION || 'na'];
  if (!clientId || !clientSecret || !host) throw new Error('Credenciales o región de Data Store incompletas.');
  const lwa = await jsonOrError(await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId,
      client_secret: clientSecret, scope: 'alexa::datastore'
    })
  }));
  const result = await jsonOrError(await fetch(`${host}/v1/datastore/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lwa.access_token}` },
    body: JSON.stringify({
      commands: [{ type: 'PUT_OBJECT', namespace: 'MiSolar', key: 'Indicadores', content: snapshot }],
      target: { type: 'DEVICES', items: [targetId] },
      attemptDeliveryUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    })
  }));
  const failures = Array.isArray(result.results)
    ? result.results.filter(item => item.type !== 'SUCCESS') : [{ type: 'SIN_RESULTADO' }];
  if (failures.length) throw new Error(`Entrega Data Store fallida: ${failures.map(x => x.type).join(', ')}`);
}

async function syncDevice(deviceId, { force = false } = {}) {
  const result = await syncMonitorToDataStore({ targetId: deviceId, writeDataStore, force });
  console.log(result.written ? 'MiSolar: Data Store actualizado' : 'MiSolar: muestra sin cambios',
    result.snapshot.sampledAt);
}

const InstalledHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UsagesInstalled';
  },
  async handle(input) {
    const deviceId = input.requestEnvelope.context?.System?.device?.deviceId || null;
    const userId = input.requestEnvelope.context?.System?.user?.userId || null;
    if (deviceId) {
      console.log('MiSolar: widget instalado; deviceId=', deviceId);
      console.log('MiSolar: userId=', userId || '(no disponible)');
      await syncDevice(deviceId, { force: true });
    }
    return input.responseBuilder.getResponse();
  }
};

const UpdatedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UpdateRequest';
  },
  async handle(input) {
    const deviceId = input.requestEnvelope.context?.System?.device?.deviceId;
    if (deviceId) await syncDevice(deviceId, { force: true });
    return input.responseBuilder.getResponse();
  }
};

const RemovedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UsagesRemoved';
  },
  handle(input) {
    console.log('MiSolar: widget desinstalado');
    return input.responseBuilder.getResponse();
  }
};

const LaunchHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'LaunchRequest';
  },
  async handle(input) {
    const deviceId = input.requestEnvelope.context?.System?.device?.deviceId;
    if (deviceId) await syncDevice(deviceId, { force: true });
    return input.responseBuilder.speak('Mi Solar está listo para mostrar tus indicadores desde la galería de widgets.').getResponse();
  }
};

const HelpHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest';
  },
  handle(input) {
    return input.responseBuilder.speak('Puedes ver la producción solar y las baterías desde el widget Mi Solar.').getResponse();
  }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(input, error) {
    console.error('MiSolar: error en Skill:', error);
    return input.responseBuilder.speak('Mi Solar está temporalmente no disponible.').getResponse();
  }
};

const alexaHandler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(InstalledHandler, UpdatedHandler, RemovedHandler, LaunchHandler, HelpHandler)
  .addErrorHandlers(ErrorHandler)
  .lambda();

exports.handler = async (event, context, callback) => {
  if (event?.source === 'aws.events' || event?.type === 'MiSolarScheduledSync') {
    const targets = String(process.env.ALEXA_WIDGET_DEVICE_IDS || process.env.ALEXA_WIDGET_DEVICE_ID || '')
      .split(',').map(value => value.trim()).filter(Boolean);
    if (!targets.length) throw new Error('Configura ALEXA_WIDGET_DEVICE_ID(S) para la sincronización programada.');
    for (const targetId of targets) await syncDevice(targetId);
    return { ok: true, targets: targets.length };
  }
  return alexaHandler(event, context, callback);
};
