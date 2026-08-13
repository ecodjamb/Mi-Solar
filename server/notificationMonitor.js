import { archiveRows } from './archive.js';
import { decryptCredentials } from './secretBox.js';
import { loginOrigin, logoutOrigin, readInverterRealtime } from './inverterControl.js';
import { listNotificationSites, readAutomationCredentials, readNotificationState, saveNotificationState } from './automationStore.js';
import { sendSiteNotification } from './pushNotifications.js';
import { automationSiteProfile } from './siteProfiles.js';

const PV1_KEYS = ['pvInputPower1', 'pvPower1', 'powerPv1', 'solarPower1', 'pv1Power', 'pvPowerInput1'];
const PV2_KEYS = ['pvInputPower2', 'pvPower2', 'powerPv2', 'solarPower2', 'pv2Power', 'pvPowerInput2'];
const LOAD_KEYS = ['acOutputActivePowerTotal', 'loadPower', 'outputActivePower', 'acOutputPower'];

function first(row, keys) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (row?.[key] !== '' && Number.isFinite(value)) return value;
  }
  return 0;
}

function chileDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function notifyServiceFailure(site, error) {
  if (!site.notificationPreferences.serviceOutage) return { status: 'disabled' };
  const previous = await readNotificationState(site.siteId, 'origin-service');
  const failures = Number(previous?.metadata?.failures || 0) + 1;
  if (previous?.state !== 'down' && failures >= 2) {
    const profile = automationSiteProfile(site.deviceSn);
    const body = `Se perdieron dos sincronizaciones consecutivas con ${profile.label}. Mi Solar seguirá reintentando automáticamente.`;
    const pushed = await sendSiteNotification(site.siteId, 'service_outage', `Mi Solar · servicio interrumpido`, body, { url: '/?page=technical', site: profile.key }, `service-down-${Date.now()}`);
    await saveNotificationState(site.siteId, 'origin-service', 'down', { failures, lastError: String(error || '').slice(0, 180) }, new Date().toISOString());
    return { status: 'down', pushed };
  }
  await saveNotificationState(site.siteId, 'origin-service', previous?.state || 'checking', { failures, lastError: String(error || '').slice(0, 180) }, previous?.last_notified_at || null);
  return { status: 'retrying', failures };
}

async function notifyServiceHealthy(site) {
  const previous = await readNotificationState(site.siteId, 'origin-service');
  let pushed = null;
  if (site.notificationPreferences.serviceOutage && previous?.state === 'down') {
    const profile = automationSiteProfile(site.deviceSn);
    pushed = await sendSiteNotification(
      site.siteId,
      'service_recovery',
      'Mi Solar · servicio recuperado',
      `La sincronización con ${profile.label} volvió a funcionar correctamente.`,
      { url: '/?page=technical', site: profile.key },
      `service-recovery-${Date.now()}`
    );
  }
  await saveNotificationState(site.siteId, 'origin-service', 'up', { failures: 0 }, pushed ? new Date().toISOString() : previous?.last_notified_at || null);
  return pushed;
}

async function evaluateSolarSurplus(site, row) {
  if (!site.notificationPreferences.solarSurplus) return { status: 'disabled' };
  const solarW = Math.max(0, first(row, PV1_KEYS) + first(row, PV2_KEYS));
  const loadW = Math.max(0, first(row, LOAD_KEYS));
  const surplus = loadW > 0 && solarW > loadW;
  const previous = await readNotificationState(site.siteId, 'solar-surplus');
  const today = chileDate();
  if (!surplus) {
    await saveNotificationState(site.siteId, 'solar-surplus', 'inactive', { consecutive: 0, lastDate: previous?.metadata?.lastDate || null, solarW, loadW }, previous?.last_notified_at || null);
    return { status: 'inactive', solarW, loadW };
  }
  const consecutive = Number(previous?.metadata?.consecutive || 0) + 1;
  if (consecutive >= 2 && previous?.metadata?.lastDate !== today) {
    const profile = automationSiteProfile(site.deviceSn);
    const surplusW = Math.max(0, solarW - loadW);
    const body = `${profile.label} está produciendo ${(solarW / 1000).toFixed(1)} kW, más que el consumo de la casa (${(loadW / 1000).toFixed(1)} kW). Excedente actual: ${(surplusW / 1000).toFixed(1)} kW.`;
    const pushed = await sendSiteNotification(site.siteId, 'solar_surplus', '☀️ Producción solar sobre el consumo', body, { url: '/', site: profile.key, solarW, loadW }, `solar-surplus-${today}`);
    await saveNotificationState(site.siteId, 'solar-surplus', 'active', { consecutive, lastDate: today, solarW, loadW }, new Date().toISOString());
    return { status: 'notified', solarW, loadW, pushed };
  }
  await saveNotificationState(site.siteId, 'solar-surplus', 'active', { consecutive, lastDate: previous?.metadata?.lastDate || null, solarW, loadW }, previous?.last_notified_at || null);
  return { status: 'active', solarW, loadW };
}

async function monitorSite(site) {
  if (!site.deviceSn || !site.credentialsConfigured) return { deviceSn: site.deviceSn, status: 'missing-credentials' };
  const encrypted = await readAutomationCredentials(site.deviceSn);
  if (!encrypted) return { deviceSn: site.deviceSn, status: 'missing-credentials' };
  let session;
  try {
    const credentials = decryptCredentials(encrypted);
    session = await loginOrigin(credentials.username, credentials.password);
    const realtime = await readInverterRealtime(site.deviceSn, session);
    await archiveRows(site.deviceSn, [realtime], { bucketMinutes: 5 }).catch(() => undefined);
    const recovery = await notifyServiceHealthy(site);
    const solar = await evaluateSolarSurplus(site, realtime);
    return { deviceSn: site.deviceSn, status: 'ok', recovery, solar };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const service = await notifyServiceFailure(site, message);
    return { deviceSn: site.deviceSn, status: 'failed', error: message, service };
  } finally {
    await logoutOrigin(session);
  }
}

export async function runNotificationMonitors() {
  const sites = await listNotificationSites();
  const settled = await Promise.all(sites.map((site) => monitorSite(site).catch((error) => ({
    deviceSn: site.deviceSn,
    status: 'failed',
    error: error instanceof Error ? error.message : String(error)
  }))));
  return { checkedAt: new Date().toISOString(), sites: sites.length, results: settled };
}
