/**
 * Sincroniza el archivo de Mi Solar con el Data Store del widget Alexa.
 * Ejecutar solo después de instalar el widget y obtener credenciales LWA.
 * Node 20+ (fetch nativo). No imprime ningún secreto.
 */
const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error('Falta variable de entorno: ' + name);
  return value;
};
const base = need('MISOLAR_BASE_URL').replace(/\/$/, '');
const widgetToken = need('ALEXA_WIDGET_TOKEN');
const clientId = need('ALEXA_LWA_CLIENT_ID');
const clientSecret = need('ALEXA_LWA_CLIENT_SECRET');
const deviceId = need('ALEXA_WIDGET_DEVICE_ID');
const region = process.env.ALEXA_API_REGION || 'na';
const hosts = {
  na: 'https://api.amazonalexa.com',
  eu: 'https://api.eu.amazonalexa.com',
  fe: 'https://api.fe.amazonalexa.com'
};
if (!hosts[region]) throw new Error('ALEXA_API_REGION debe ser na, eu o fe');

async function jsonOrError(response) {
  const body = await response.text();
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + body.slice(0, 240));
  return body ? JSON.parse(body) : {};
}
const snapshot = await jsonOrError(await fetch(base + '/api/alexa/widget-data', {
  headers: { Authorization: 'Bearer ' + widgetToken, Accept: 'application/json' }
}));
const lwa = await jsonOrError(await fetch('https://api.amazon.com/auth/o2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId,
    client_secret: clientSecret, scope: 'alexa::datastore'
  })
}));
const result = await jsonOrError(await fetch(hosts[region] + '/v1/datastore/commands', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lwa.access_token },
  body: JSON.stringify({
    commands: [{
      type: 'PUT_OBJECT', namespace: 'MiSolar', key: 'Indicadores', content: snapshot
    }],
    target: { type: 'DEVICES', items: [deviceId] }
  })
}));
const outcomes = Array.isArray(result.results) ? result.results : [];
const failures = outcomes.filter(item => item.type !== 'SUCCESS');
if (failures.length) {
  throw new Error('Alexa no entregó el widget a todos los destinos: ' +
    failures.map(item => item.type).join(', '));
}
console.log('Actualización entregada por Alexa:', outcomes.length);
