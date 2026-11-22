/** Sincroniza la API pública de Mi Solar con Alexa Data Store. Node 20+. */
import monitorSync from './monitor-sync.cjs';
import datastoreClient from './datastore-client.cjs';

const { syncMonitorToDataStore } = monitorSync;
const { writeDataStore } = datastoreClient;
const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error('Falta variable de entorno: ' + name);
  return value;
};
const userId = process.env.ALEXA_WIDGET_USER_ID;
const deviceId = process.env.ALEXA_WIDGET_DEVICE_ID;
const target = userId
  ? { type: 'USER', id: userId }
  : deviceId ? { type: 'DEVICES', items: [deviceId] } : null;
if (!target) throw new Error('Falta ALEXA_WIDGET_USER_ID o ALEXA_WIDGET_DEVICE_ID.');
need('ALEXA_LWA_CLIENT_ID');
need('ALEXA_LWA_CLIENT_SECRET');

const result = await syncMonitorToDataStore({ target, writeDataStore, force: true });
console.log(result.written
  ? `Muestra ${result.snapshot.sampledAt} entregada a Alexa.`
  : `Muestra ${result.snapshot.sampledAt} sin cambios; escritura omitida.`);
