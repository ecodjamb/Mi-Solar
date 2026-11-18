'use strict';

/**
 * Código para la Skill Alexa-hosted (Node.js) de prueba.
 * Instalar la dependencia ask-sdk-core en el proyecto de Amazon,
 * no en la app Vite de Mi Solar.
 */
const Alexa = require('ask-sdk-core');

const InstalledHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'Alexa.DataStore.PackageManager.UsagesInstalled';
  },
  handle(input) {
    const deviceId = input.requestEnvelope.context?.System?.device?.deviceId || null;
    const userId = input.requestEnvelope.context?.System?.user?.userId || null;
    if (deviceId) {
      console.log('MiSolar: widget instalado; deviceId=', deviceId);
      console.log('MiSolar: userId=', userId || '(no disponible)');
    }
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
  handle(input) {
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

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(InstalledHandler, RemovedHandler, LaunchHandler, HelpHandler)
  .addErrorHandlers(ErrorHandler)
  .lambda();
