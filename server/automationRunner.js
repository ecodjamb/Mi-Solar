import { applyInverterTarget } from './inverterControl.js';
import { forecastForDate } from './solarProjection.js';
import {
  listEnabledAutomationRules,
  readAutomationExecution,
  recordAutomationExecution,
  recordConfigurationEvent
} from './automationStore.js';
import { sendSiteNotification } from './pushNotifications.js';
import { automationSiteProfile } from './siteProfiles.js';
import { withISolarProviderSession } from './providerStore.js';

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
  return difference >= 0;
}

function addDays(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function conditionDueNow(condition, now) {
  const difference = minutes(now.time) - minutes(condition.runAtLocal);
  // Después de la hora programada la condición sigue siendo elegible durante
  // ese día. Esto recupera un cron omitido y permite usar el pronóstico fijado
  // a las 21:35 aunque el tramo tuviera una hora anterior (por ejemplo 20:00).
  return condition.enabled !== false && difference >= 0;
}

function conditionMatches(condition, forecastKwh) {
  const min = Number(condition.minKwh ?? 0);
  const max = Number(condition.maxKwh ?? 60);
  return condition.kind === 'lessThan' ? forecastKwh < max : forecastKwh >= min && forecastKwh <= max;
}

export function automationNotificationMessage(preset, changed) {
  if (changed && preset === 'sunny') return 'Se realizó cambio de configuración en inversor a día soleado para mañana.';
  if (changed && preset === 'cloudy') return 'Se realizó cambio de configuración en inversor a día nublado para mañana.';
  if (preset === 'sunny') return 'No se modificaron parámetros del inversor, ya que mañana estará con sol.';
  return 'No se modificaron parámetros del inversor, ya que mañana estará nublado.';
}

async function executeRule(rule, now) {
  if (!rule.deviceSn) return { deviceSn: rule.deviceSn, status: 'not-due' };
  let condition = null;
  let projection = null;

  // Conciliación de una ejecución perdida: si aún es la mañana, no existe una
  // ejecución válida para hoy y sí hay un pronóstico nocturno fijado, aplicar
  // una sola vez la condición que correspondía. Leer antes de escribir hace
  // que también sea seguro cuando el inversor ya estaba en el perfil correcto.
  const todayExecution = await readAutomationExecution(rule.siteId, now.date);
  if (minutes(now.time) < 12 * 60 && (!todayExecution || todayExecution.action === 'failed')) {
    const todayProjection = await forecastForDate(rule.deviceSn, now.date);
    if (todayProjection?.locked) {
      condition = (rule.conditions || []).find((candidate) => candidate.enabled !== false
        && candidate.dayOffset !== 0
        && conditionMatches(candidate, todayProjection.forecastKwh));
      if (condition) projection = todayProjection;
    }
  }

  if (!condition) {
    const dueConditions = (rule.conditions || []).filter((candidate) => conditionDueNow(candidate, now));
    if (!dueConditions.length) return { deviceSn: rule.deviceSn, status: 'not-due' };
    for (const candidate of dueConditions) {
      const targetDate = addDays(now.date, candidate.dayOffset === 0 ? 0 : 1);
      const candidateProjection = await forecastForDate(rule.deviceSn, targetDate);
      if (conditionMatches(candidate, candidateProjection.forecastKwh)) {
        condition = candidate;
        projection = candidateProjection;
        break;
      }
    }
  }
  if (!condition || !projection) return { deviceSn: rule.deviceSn, status: 'no-condition-match' };
  const previousExecution = await readAutomationExecution(rule.siteId, projection.date);
  if (previousExecution && previousExecution.action !== 'failed') return { deviceSn: rule.deviceSn, status: 'already-executed' };
  const preset = condition.preset;
  const target = rule[preset];
  try {
    const result = await withISolarProviderSession(rule.deviceSn, ({ session, deviceSn }) => applyInverterTarget(deviceSn, target, session));
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
      threshold_kwh: Number(condition.maxKwh ?? condition.minKwh ?? rule.thresholdKwh),
      automation_condition_id: condition.id,
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
    const pushed = rule.notificationPreferences.automationExecuted
      ? await sendSiteNotification(
        rule.siteId,
        'automation_executed',
        `${preset === 'sunny' ? '☀️' : '☁️'} Mi Solar · ${profile.label}`,
        message,
        { url: '/?page=programming', preset, forecastDate: projection.date },
        `automation-${projection.date}`
      )
      : { sent: 0, failed: 0, configured: true, skipped: true };
    if (execution?.id && pushed.sent > 0) {
      await recordAutomationExecution(rule.siteId, { ...execution, notified: true });
    }
    return { deviceSn: rule.deviceSn, status: action, preset, projection, pushed };
  } catch (error) {
    const profile = automationSiteProfile(rule.deviceSn);
    const message = `La automatización de ${profile.label} falló: ${String(error?.message || 'error desconocido').slice(0, 180)}`;
    await recordAutomationExecution(rule.siteId, {
      forecast_date: projection.date,
      evaluated_at: new Date().toISOString(),
      forecast_kwh: projection.forecastKwh,
      threshold_kwh: Number(condition.maxKwh ?? condition.minKwh ?? rule.thresholdKwh),
      automation_condition_id: condition.id,
      preset,
      action: 'failed',
      before_config: {},
      after_config: {},
      message,
      notified: false
    }).catch(() => undefined);
    await recordConfigurationEvent(rule.deviceSn, {
      source: 'automatic', preset, forecastDate: projection.date, forecastKwh: projection.forecastKwh,
      before: {}, target, after: {}, commands: {}, success: false, message
    }).catch(() => undefined);
    throw error;
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
  console.log('[automation/run] completed', { checkedAt: new Date().toISOString(), chile: now, rules: rules.length, results });
  return { checkedAt: new Date().toISOString(), chile: now, rules: rules.length, results };
}
