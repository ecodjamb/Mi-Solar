'use strict';

/**
 * Código para la Skill Alexa-hosted (Node.js) de prueba.
 * Instalar la dependencia ask-sdk-core en el proyecto de Amazon,
 * no en la app Vite de Mi Solar.
 */
const Alexa = require('ask-sdk-core');
const { syncMonitorToDataStore } = require('./monitor-sync.cjs');
const { isAlexaDeviceId, maskIdentifier, safeError, writeDataStore } = require('./datastore-client.cjs');

function deviceIdFromEnvelope(envelope) {
  const deviceId = envelope?.context?.System?.device?.deviceId || null;
  return isAlexaDeviceId(deviceId) ? deviceId : null;
}

async function syncDevice(deviceId, { force = false } = {}) {
  const result = await syncMonitorToDataStore({ targetId: deviceId, writeDataStore, force });
  console.log('MiSolar: sincronización', {
    target: maskIdentifier(deviceId),
    written: result.written,
    sampledAt: result.snapshot.sampledAt,
    source: result.source,
    protectedEndpoint: result.protectedError ? 'respaldo público' : 'ok'
  });
  return result;
}

async function syncDeviceSafely(deviceId, options) {
  if (!deviceId) {
    console.warn('MiSolar: evento sin Alexa deviceId válido; no se intentó escribir Data Store.');
    return null;
  }
  try {
    return await syncDevice(deviceId, options);
  } catch (error) {
    console.error('MiSolar: sincronización fallida', safeError(error));
    return null;
  }
}

const InstalledHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UsagesInstalled';
  },
  async handle(input) {
    const deviceId = deviceIdFromEnvelope(input.requestEnvelope);
    if (deviceId) {
      console.log('MiSolar: widget instalado', {
        target: maskIdentifier(deviceId),
        version: input.requestEnvelope.request?.payload?.packageVersion || 'desconocida',
        usages: input.requestEnvelope.request?.payload?.usages?.length || 0
      });
      await syncDeviceSafely(deviceId, { force: true });
    }
    return input.responseBuilder.getResponse();
  }
};

const UpdatedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UpdateRequest';
  },
  async handle(input) {
    const deviceId = deviceIdFromEnvelope(input.requestEnvelope);
    await syncDeviceSafely(deviceId, { force: true });
    return input.responseBuilder.getResponse();
  }
};

const RemovedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UsagesRemoved';
  },
  handle(input) {
    console.log('MiSolar: widget desinstalado', {
      target: maskIdentifier(deviceIdFromEnvelope(input.requestEnvelope)),
      usages: input.requestEnvelope.request?.payload?.usages?.length || 0
    });
    return input.responseBuilder.getResponse();
  }
};

const LaunchHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'LaunchRequest';
  },
  async handle(input) {
    const deviceId = deviceIdFromEnvelope(input.requestEnvelope);
    await syncDeviceSafely(deviceId, { force: true });
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
    console.error('MiSolar: error en Skill', safeError(error));
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
      .split(',').map(value => value.trim()).filter(isAlexaDeviceId);
    if (!targets.length) throw new Error('Configura ALEXA_WIDGET_DEVICE_ID(S) para la sincronización programada.');
    for (const targetId of targets) await syncDevice(targetId);
    return { ok: true, targets: targets.length };
  }
  return alexaHandler(event, context, callback);
};
