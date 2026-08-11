import { decryptCredentials } from './secretBox.js';
import { applyInverterTarget, loginOrigin, logoutOrigin } from './inverterControl.js';
import { forecastTomorrow } from './solarProjection.js';
import {
  listEnabledAutomationRules,
  readAutomationCredentials,
  readAutomationExecution,
  recordAutomationExecution,
  recordConfigurationEvent
} from './automationStore.js';
import { sendAutomationPush } from './pushNotifications.js';
import { automationSiteProfile } from './siteProfiles.js';

function chileClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
}

function minutes(value) {
  const [hour, minute] = String(value || '22:00').slice(0, 5).split(':').map(Number);
  return hour * 60 + minute;
}

export function automationDueNow(rule, now) {
  const difference = minutes(now.time) - minutes(rule.runAtLocal);
  return difference >= 0 && difference < 5;
}

export function automationNotificationMessage(preset, changed) {
  if (changed && preset === 'sunny') return 'Se realizó cambio de configuración en inversor a día soleado para mañana.';
  if (changed && preset === 'cloudy') return 'Se realizó cambio de configuración en inversor a día nublado para mañana.';
  if (preset === 'sunny') return 'No se modificaron parámetros del inversor, ya que mañana estará con sol.';
  return 'No se modificaron parámetros del inversor, ya que mañana estará nublado.';
}

async function executeRule(rule, now) {
  if (!rule.deviceSn || !automationDueNow(rule, now)) return { deviceSn: rule.deviceSn, status: 'not-due' };
  const projection = await forecastTomorrow(rule.deviceSn);
  if (await readAutomationExecution(rule.siteId, projection.date)) return { deviceSn: rule.deviceSn, status: 'already-executed' };
  const preset = projection.forecastKwh > rule.thresholdKwh ? 'sunny' : 'cloudy';
  const target = rule[preset];
  const encrypted = await readAutomationCredentials(rule.deviceSn);
  if (!encrypted) throw new Error(`Faltan credenciales automáticas para ${rule.deviceSn}.`);
  const credentials = decryptCredentials(encrypted);
  let session;
  try {
    session = await loginOrigin(credentials.username, credentials.password);
    const result = await applyInverterTarget(rule.deviceSn, target, session);
    const changed = result.changed && result.confirmed;
    const action = result.confirmed ? (result.changed ? 'changed' : 'unchanged') : 'failed';
    const profile = automationSiteProfile(rule.deviceSn);
    const message = result.confirmed
      ? automationNotificationMessage(preset, changed)
      : `La automatización de ${profile.label} no pudo confirmar todos los parámetros.`;
    const execution = await recordAutomationExecution(rule.siteId, {
      forecast_date: projection.date,
      evaluated_at: new Date().toISOString(),
      forecast_kwh: projection.forecastKwh,
      threshold_kwh: rule.thresholdKwh,
      preset,
      action,
      before_config: result.before,
      after_config: result.after,
      message,
      notified: false
    });
    await recordConfigurationEvent(rule.deviceSn, {
      source: 'automatic', preset, forecastDate: projection.date, forecastKwh: projection.forecastKwh,
      before: result.before, target, after: result.after,
      commands: { requested: result.commands, sent: result.commandResults }, success: result.confirmed, message
    });
    const pushed = await sendAutomationPush(rule.siteId, `Mi Solar · ${profile.label}`, message, { url: '/?page=programming', preset, forecastDate: projection.date });
    if (execution?.id && pushed.sent > 0) {
      await recordAutomationExecution(rule.siteId, { ...execution, notified: true });
    }
    return { deviceSn: rule.deviceSn, status: action, preset, projection, pushed };
  } finally {
    await logoutOrigin(session);
  }
}

export async function runDueAutomations(nowDate = new Date()) {
  const now = chileClock(nowDate);
  const rules = await listEnabledAutomationRules();
  const results = [];
  for (const rule of rules) {
    try { results.push(await executeRule(rule, now)); }
    catch (error) {
      console.error('[automation] failed', { deviceSn: rule.deviceSn, error: error instanceof Error ? error.message : String(error) });
      results.push({ deviceSn: rule.deviceSn, status: 'failed', error: error instanceof Error ? error.message : 'Error desconocido' });
    }
  }
  return { checkedAt: new Date().toISOString(), chile: now, rules: rules.length, results };
}
