import { archiveRows } from './archive.js';
import { decryptCredentials } from './secretBox.js';
import { loginOrigin, logoutOrigin, readInverterRealtime } from './inverterControl.js';
import { listNotificationSites, readAutomationCredentials, readNotificationState, saveNotificationState } from './automationStore.js';
import { sendSiteNotification } from './pushNotifications.js';
import { automationSiteProfile } from './siteProfiles.js';
import { listDueWaterReminders } from './waterCosts.js';
import { listDueUtilityBillReminders } from './utilityBills.js';

const PV1_KEYS = ['pvInputPower1', 'pvPower1', 'powerPv1', 'solarPower1', 'pv1Power', 'pvPowerInput1'];
const PV2_KEYS = ['pvInputPower2', 'pvPower2', 'powerPv2', 'solarPower2', 'pv2Power', 'pvPowerInput2'];
const LOAD_KEYS = ['acOutputActivePowerTotal', 'loadPower', 'outputActivePower', 'acOutputPower'];
const BATTERY_DISCHARGE_KEYS = ['batteryDischargingPower', 'batteryDischargePower', 'dischargePower'];
const GRID_STATUS_KEYS = ['statusGrid', 'gridStatus'];
const GRID_VOLTAGE_KEYS = ['gridVoltageR', 'gridInputVoltage', 'acInputVoltageR'];
const GRID_FREQUENCY_KEYS = ['gridFrequency', 'gridInputFrequency', 'acInputFrequency'];
const LOAD_STATUS_KEYS = ['statusLoad', 'loadStatus'];
const SOLAR_STATUS_KEYS = ['statusSolar1', 'statusSolar2'];

function first(row, keys) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (row?.[key] !== '' && Number.isFinite(value)) return value;
  }
  return 0;
}

function signal(row, keys) {
  for (const key of keys) {
    const raw = row?.[key];
    const value = Number(raw);
    if (raw !== '' && raw != null && Number.isFinite(value)) return { found: true, key, value };
  }
  return { found: false, key: null, value: null };
}

export function assessGridOutage(row) {
  const gridStatus = signal(row, GRID_STATUS_KEYS);
  const gridVoltage = signal(row, GRID_VOLTAGE_KEYS);
  const gridFrequency = signal(row, GRID_FREQUENCY_KEYS);
  const loadStatus = signal(row, LOAD_STATUS_KEYS);
  const dischargeW = Math.max(0, first(row, BATTERY_DISCHARGE_KEYS));
  const loadW = Math.max(0, first(row, LOAD_KEYS));
  const solarW = Math.max(0, first(row, PV1_KEYS) + first(row, PV2_KEYS));
  const solarStates = SOLAR_STATUS_KEYS.map((key) => signal(row, [key])).filter((item) => item.found);

  const statusSaysOff = gridStatus.found && gridStatus.value !== 1;
  const voltageSaysOff = gridVoltage.found && gridVoltage.value < 30;
  const frequencySaysOff = gridFrequency.found && gridFrequency.value < 5;
  const electricalSignalsSayOff = voltageSaysOff && frequencySaysOff;
  const gridLost = statusSaysOff || (!gridStatus.found && electricalSignalsSayOff);
  const voltageHealthy = !gridVoltage.found || (gridVoltage.value >= 150 && gridVoltage.value <= 280);
  const frequencyHealthy = !gridFrequency.found || (gridFrequency.value >= 45 && gridFrequency.value <= 55);
  const gridHealthy = gridStatus.found && gridStatus.value === 1 && voltageHealthy && frequencyHealthy;
  const batterySupplying = dischargeW >= 30;
  const housePowered = loadW >= 50 && (!loadStatus.found || loadStatus.value === 1);
  const solarDisconnectedOrIdle = solarW < 50 && (solarStates.length === 0 || solarStates.every((item) => item.value === 0));
  const highConfidence = gridLost && batterySupplying && housePowered && electricalSignalsSayOff;

  return {
    outage: gridLost && batterySupplying && housePowered,
    gridHealthy,
    highConfidence,
    solarDisconnectedOrIdle,
    solarW,
    loadW,
    dischargeW,
    gridStatus: gridStatus.value,
    gridVoltage: gridVoltage.value,
    gridFrequency: gridFrequency.value,
    evidence: {
      gridStatusKey: gridStatus.key,
      gridVoltageKey: gridVoltage.key,
      gridFrequencyKey: gridFrequency.key,
      statusSaysOff,
      voltageSaysOff,
      frequencySaysOff,
      batterySupplying,
      housePowered
    }
  };
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

async function evaluateGridOutage(site, row) {
  const profile = automationSiteProfile(site.deviceSn);
  if (profile.key !== 'arrayan') return { status: 'not-grid-connected' };
  if (!site.notificationPreferences.gridOutage) return { status: 'disabled' };

  const assessment = assessGridOutage(row);
  const previous = await readNotificationState(site.siteId, 'grid-outage');
  const previousConsecutive = Number(previous?.metadata?.consecutive || 0);

  if (assessment.outage) {
    const consecutive = previousConsecutive + 1;
    const confirmed = assessment.highConfidence || consecutive >= 2;
    const startedAt = previous?.metadata?.startedAt || new Date().toISOString();
    if (confirmed && previous?.state !== 'outage') {
      const solarContext = assessment.solarDisconnectedOrIdle
        ? ' Los paneles están sin producción.'
        : ` Los paneles aportan ${(assessment.solarW / 1000).toFixed(1)} kW.`;
      const body = `La red eléctrica está inactiva y la casa continúa funcionando con batería: consumo ${(assessment.loadW / 1000).toFixed(1)} kW y descarga ${(assessment.dischargeW / 1000).toFixed(1)} kW.${solarContext}`;
      const pushed = await sendSiteNotification(
        site.siteId,
        'grid_outage',
        `⚡ Corte de red en ${profile.label}`,
        body,
        { url: '/', site: profile.key, ...assessment },
        `grid-outage-${Date.now()}`
      );
      await saveNotificationState(site.siteId, 'grid-outage', 'outage', { ...assessment, consecutive, startedAt }, new Date().toISOString());
      return { status: 'notified', assessment, pushed };
    }
    await saveNotificationState(site.siteId, 'grid-outage', confirmed ? 'outage' : 'suspected', { ...assessment, consecutive, startedAt }, previous?.last_notified_at || null);
    return { status: confirmed ? 'outage' : 'confirming', assessment, consecutive };
  }

  if (previous?.state === 'outage' && !assessment.gridHealthy) {
    await saveNotificationState(site.siteId, 'grid-outage', 'outage', { ...previous.metadata, ...assessment, consecutive: 0 }, previous?.last_notified_at || null);
    return { status: 'outage-until-grid-recovers', assessment };
  }

  let pushed = null;
  if (previous?.state === 'outage') {
    const startedAt = Date.parse(previous?.metadata?.startedAt || '');
    const durationMinutes = Number.isFinite(startedAt) ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : null;
    const durationText = durationMinutes ? ` El corte duró aproximadamente ${durationMinutes} min.` : '';
    pushed = await sendSiteNotification(
      site.siteId,
      'grid_recovery',
      `✅ Red eléctrica restablecida en ${profile.label}`,
      `La red volvió a estar activa y estable.${durationText}`,
      { url: '/', site: profile.key, durationMinutes, ...assessment },
      `grid-recovery-${Date.now()}`
    );
  }
  await saveNotificationState(site.siteId, 'grid-outage', 'normal', { ...assessment, consecutive: 0 }, pushed ? new Date().toISOString() : previous?.last_notified_at || null);
  return { status: pushed ? 'recovered' : 'normal', assessment, pushed };
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
    const grid = await evaluateGridOutage(site, realtime);
    const solar = await evaluateSolarSurplus(site, realtime);
    return { deviceSn: site.deviceSn, status: 'ok', recovery, grid, solar };
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
  const [settled, waterDue, utilityDue] = await Promise.all([
    Promise.all(sites.map((site) => monitorSite(site).catch((error) => ({
      deviceSn: site.deviceSn,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error)
    })))),
    listDueWaterReminders().catch(() => []),
    listDueUtilityBillReminders().catch(() => [])
  ]);
  const waterReminders = [];
  for (const reminder of waterDue) {
    const eventKey = `water-reading-${reminder.periodId}-${reminder.kind}`;
    const previous = await readNotificationState(reminder.siteId, eventKey);
    if (previous?.state === 'sent') {
      waterReminders.push({ ...reminder, status: 'already-sent' });
      continue;
    }
    const pushed = await sendSiteNotification(
      reminder.siteId,
      'water_reading_reminder',
      reminder.kind === 'same-day' ? '💧 Ingresa hoy la lectura de agua' : '💧 Mañana corresponde la lectura de agua',
      `${reminder.kind === 'same-day' ? 'Hoy' : 'Mañana'} ${new Date(`${reminder.expectedCloseDate}T12:00:00`).toLocaleDateString('es-CL', { dateStyle: 'long' })} corresponde la lectura de Aguas Andinas. Sube una foto o ingresa el número en Mi Solar.`,
      { url: '/?page=water', expectedCloseDate: reminder.expectedCloseDate, kind: reminder.kind },
      eventKey
    );
    await saveNotificationState(reminder.siteId, eventKey, 'sent', reminder, new Date().toISOString());
    waterReminders.push({ ...reminder, status: 'sent', pushed });
  }
  const utilityBillReminders = [];
  for (const reminder of utilityDue) {
    const eventKey = `utility-reading-${reminder.nextReadingDate}-${reminder.kind}`;
    const previous = await readNotificationState(reminder.siteId, eventKey);
    if (previous?.state === 'sent') {
      utilityBillReminders.push({ ...reminder, status: 'already-sent' });
      continue;
    }
    const sameDay = reminder.kind === 'same-day';
    const pushed = await sendSiteNotification(
      reminder.siteId,
      'utility_reading_reminder',
      sameDay ? '⚡ Hoy corresponde ingresar la lectura' : '⚡ Mañana corresponde ingresar la lectura',
      sameDay
        ? 'Hoy termina el período estimado de Enel. Ingresa la lectura o sube la cuenta cuando esté disponible.'
        : 'Mañana termina el período estimado de Enel. Ten preparada la lectura para mantener la proyección al día.',
      { url: '/?page=costs', nextReadingDate: reminder.nextReadingDate, kind: reminder.kind },
      eventKey
    );
    await saveNotificationState(reminder.siteId, eventKey, 'sent', reminder, new Date().toISOString());
    utilityBillReminders.push({ ...reminder, status: 'sent', pushed });
  }
  return { checkedAt: new Date().toISOString(), sites: sites.length, results: settled, waterReminders, utilityBillReminders };
}
