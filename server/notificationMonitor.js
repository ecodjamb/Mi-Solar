import { listNotificationSites, readNotificationState, saveNotificationState } from './automationStore.js';
import { sendSiteNotification } from './pushNotifications.js';
import { automationSiteProfile } from './siteProfiles.js';
import { listDueWaterReminders } from './waterCosts.js';
import { listDueUtilityBillReminders } from './utilityBills.js';
import { latestCanonical } from './providerStore.js';
import { canonicalToLegacy } from './canonicalTelemetry.js';

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

function chileHour(now = new Date()) {
  const value = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number(value);
}

export function chooseFreshestProviderSample(samples, now = new Date(), maximumAgeMs = 10 * 60_000) {
  const candidates = (samples || []).filter((sample) => sample?.canonical).map((sample) => {
    const timestamp = sample.received_at || sample.sampled_at || sample.canonical?.time?.sampled_at_utc;
    return { ...sample, timestamp, timestampMs: Date.parse(timestamp || '') };
  }).filter((sample) => Number.isFinite(sample.timestampMs)).sort((left, right) => right.timestampMs - left.timestampMs);
  const selected = candidates[0] || null;
  if (!selected) return { sample: null, stale: true, ageMs: null };
  const ageMs = Math.max(0, now.getTime() - selected.timestampMs);
  return { sample: selected, stale: ageMs > maximumAgeMs, ageMs };
}

export function assessBatteryAfterSunset(row, now = new Date()) {
  const solarW = Math.max(0, first(row, PV1_KEYS) + first(row, PV2_KEYS));
  const loadW = Math.max(0, first(row, LOAD_KEYS));
  const dischargeW = Math.max(0, first(row, BATTERY_DISCHARGE_KEYS));
  const afterFourPm = chileHour(now) >= 16;
  const solarGone = solarW <= 150;
  const batterySupplying = dischargeW >= 100;
  const housePowered = loadW >= 100;
  return { active: afterFourPm && solarGone && batterySupplying && housePowered, afterFourPm, solarGone, batterySupplying, housePowered, solarW, loadW, dischargeW };
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

async function evaluateBatteryAfterSunset(site, row, provider, sampledAt, now = new Date()) {
  if (!site.notificationPreferences.batteryAfterSunset) return { status: 'disabled' };
  const assessment = assessBatteryAfterSunset(row, now);
  const previous = await readNotificationState(site.siteId, 'battery-after-sunset');
  const today = chileDate(now);
  if (!assessment.active) {
    await saveNotificationState(site.siteId, 'battery-after-sunset', 'inactive', {
      ...assessment, provider, sampledAt, lastDate: previous?.metadata?.lastDate || null
    }, previous?.last_notified_at || null);
    return { status: 'inactive', assessment };
  }
  if (previous?.metadata?.lastDate === today) return { status: 'already-notified', assessment };
  const profile = automationSiteProfile(site.deviceSn);
  const body = `Ahora ya se fue el sol y ${profile.label} está funcionando con batería (${Math.round(assessment.dischargeW).toLocaleString('es-CL')} W). Apaga los artefactos que no necesites para cuidar la carga disponible.`;
  const pushed = await sendSiteNotification(
    site.siteId,
    'battery_after_sunset',
    '🔋 Estamos funcionando con batería',
    body,
    { url: '/', site: profile.key, provider, sampledAt, ...assessment },
    `battery-after-sunset-${site.siteId}-${today}`
  );
  await saveNotificationState(site.siteId, 'battery-after-sunset', 'notified', {
    ...assessment, provider, sampledAt, lastDate: today
  }, now.toISOString());
  return { status: 'notified', assessment, pushed };
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
  if (!site.deviceSn) return { deviceSn: site.deviceSn, status: 'missing-site' };
  try {
    const providerSamples = await Promise.all(['isolar', 'watchpower'].map(async (provider) => {
      try { return { ...(await latestCanonical(site.siteId, provider)), provider }; }
      catch { return null; }
    }));
    const freshest = chooseFreshestProviderSample(providerSamples);
    if (!freshest.sample || freshest.stale) throw new Error('No existe telemetría reciente y confiable de i.Solar ni WatchPower.');
    const provider = freshest.sample.provider;
    const sampledAt = freshest.sample.timestamp;
    const realtime = canonicalToLegacy(freshest.sample.canonical);
    const recovery = await notifyServiceHealthy(site);
    // WatchPower puede publicar 0 W de red cuando simplemente no hay
    // intercambio. Sin voltaje/frecuencia explícitos eso no prueba un corte.
    const grid = provider === 'isolar'
      ? await evaluateGridOutage(site, realtime)
      : { status: 'provider-without-grid-outage-proof', provider };
    const solar = await evaluateSolarSurplus(site, realtime);
    const batteryAfterSunset = await evaluateBatteryAfterSunset(site, realtime, provider, sampledAt);
    return { deviceSn: site.deviceSn, status: 'ok', provider, sampledAt, recovery, grid, solar, batteryAfterSunset };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const service = await notifyServiceFailure(site, message);
    return { deviceSn: site.deviceSn, status: 'failed', error: message, service };
  }
}

export async function runNotificationMonitors() {
  const sites = await listNotificationSites();
  const settled=await Promise.all(sites.map(site=>monitorSite(site).catch(error=>({
    deviceSn:site.deviceSn,status:'failed',error:error instanceof Error?error.message:String(error)
  }))));
  return {checkedAt:new Date().toISOString(),sites:sites.length,results:settled};
}

/** Utility reading reminders have a separate morning schedule, independent of live alerts. */
export async function runReadingReminders(){
  const [waterDue,utilityDue]=await Promise.all([
    listDueWaterReminders().catch(()=>[]),listDueUtilityBillReminders().catch(()=>[])
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
  return { checkedAt: new Date().toISOString(), waterReminders, utilityBillReminders };
}
