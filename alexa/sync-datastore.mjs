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
const deviceId = need('ALEXA_WIDGET_DEVICE_ID');
need('ALEXA_LWA_CLIENT_ID');
need('ALEXA_LWA_CLIENT_SECRET');

const result = await syncMonitorToDataStore({ targetId: deviceId, writeDataStore });
console.log(result.written
  ? `Muestra ${result.snapshot.sampledAt} entregada a Alexa.`
  : `Muestra ${result.snapshot.sampledAt} sin cambios; escritura omitida.`);
