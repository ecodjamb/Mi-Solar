import { ensureSite, resolveDeviceReference, rest } from './archive.js';
import { ARRAYAN_EQUIPMENT_CONFIGURATIONS, PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS } from './siteProfiles.js';

const defaults = {
  enabled: false,
  execution_mode: 'manual',
  threshold_kwh: 20,
  run_at_local: '22:00',
  sunny_redischarge: 25,
  sunny_output: 'SBU',
  cloudy_redischarge: 50,
  cloudy_output: 'SOL',
  conditions: [],
  notification_preferences: {
    automationExecuted: true,
    automationState: true,
    serviceOutage: true,
    gridOutage: true,
    solarSurplus: true,
    batteryAfterSunset: true
  }
};

export const DEFAULT_NOTIFICATION_PREFERENCES = { ...defaults.notification_preferences };

function defaultConditions(row) {
  const threshold = Number(row?.threshold_kwh ?? 20);
  const runAtLocal = String(row?.run_at_local || '22:00').slice(0, 5);
  return [
    { id: 'cloudy-default', enabled: true, kind: 'lessThan', minKwh: 0, maxKwh: threshold, preset: 'cloudy', runAtLocal, dayOffset: -1 },
    { id: 'sunny-default', enabled: true, kind: 'between', minKwh: threshold, maxKwh: 60, preset: 'sunny', runAtLocal, dayOffset: -1 }
  ];
}

export function canonicalAutomationConditions(conditions) {
  if (!Array.isArray(conditions)) return [];
  return conditions.map((condition) => ({
    id: String(condition?.id || ''),
    enabled: condition?.enabled !== false,
    kind: condition?.kind,
    minKwh: Number(condition?.minKwh ?? 0),
    maxKwh: Number(condition?.maxKwh),
    preset: condition?.preset,
    runAtLocal: String(condition?.runAtLocal || '').slice(0, 5),
    dayOffset: Number(condition?.dayOffset)
  }));
}

function normalize(row, extras = {}) {
  const executionPreset = extras.lastExecution?.action === 'failed' ? null : extras.lastExecution?.preset;
  const executionOutput = executionPreset === 'sunny'
    ? row?.sunny_output
    : executionPreset === 'cloudy' ? row?.cloudy_output : null;
  return {
    enabled: Boolean(row?.enabled),
    executionMode: row?.execution_mode || 'manual',
    thresholdKwh: Number(row?.threshold_kwh ?? 20),
    runAtLocal: String(row?.run_at_local || '22:00').slice(0, 5),
    sunny: { redischarge: Number(row?.sunny_redischarge ?? 25), output: row?.sunny_output || 'SBU' },
    cloudy: { redischarge: Number(row?.cloudy_redischarge ?? 50), output: row?.cloudy_output || 'SOL' },
    conditions: canonicalAutomationConditions(Array.isArray(row?.conditions) && row.conditions.length ? row.conditions : defaultConditions(row)),
    notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(row?.notification_preferences || {}) },
    updatedAt: row?.updated_at || null,
    credentialsConfigured: Boolean(extras.credentialsConfigured),
    notificationsConfigured: Boolean(extras.notificationsConfigured),
    lastExecution: extras.lastExecution || null,
    outputPriority: extras.lastConfirmedOutput || executionOutput || null,
    outputPriorityObservedAt: extras.lastConfirmedOutputObservedAt || extras.lastExecution?.evaluated_at || null
  };
}

function confirmedOutputFromEvent(event) {
  const candidates = [
    event?.after_config?.output?.mode,
    event?.after_config?.output,
    event?.target_config?.output?.mode,
    event?.target_config?.output
  ];
  return candidates.find((value) => ['Utility', 'SOL', 'SBU'].includes(value)) || null;
}

async function extras(siteId) {
  const [credentials, subscriptions, executions, configurationEvents] = await Promise.all([
    rest(`automation_credentials?site_id=eq.${siteId}&select=id&limit=1`),
    rest(`push_subscriptions?site_id=eq.${siteId}&select=id&limit=1`),
    rest(`automation_executions?site_id=eq.${siteId}&select=forecast_date,evaluated_at,forecast_kwh,preset,action,message,notified&order=evaluated_at.desc&limit=1`),
    rest(`inverter_configuration_events?site_id=eq.${siteId}&success=eq.true&select=after_config,target_config,requested_at&order=requested_at.desc&limit=10`)
  ]);
  const confirmedEvent = (configurationEvents || []).find((event) => confirmedOutputFromEvent(event));
  return {
    credentialsConfigured: Boolean(credentials?.[0]?.id),
    notificationsConfigured: Boolean(subscriptions?.[0]?.id),
    lastExecution: executions?.[0] || null,
    lastConfirmedOutput: confirmedOutputFromEvent(confirmedEvent),
    lastConfirmedOutputObservedAt: confirmedEvent?.requested_at || null
  };
}

export async function readAutomationRule(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  if (!siteId) return { ...normalize(defaults), configured: false };
  const rows = await rest(`automation_rules?site_id=eq.${siteId}&select=*&limit=1`);
  if (rows?.[0]) return { ...normalize(rows[0], await extras(siteId)), configured: true };
  const created = await rest('automation_rules', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, ...defaults })
  });
  return { ...normalize(created?.[0] || defaults, await extras(siteId)), configured: true };
}

export async function updateAutomationRule(deviceSn, patch) {
  const siteId = await ensureSite(deviceSn);
  if (!siteId) return { ...normalize({ ...defaults, ...patch }), configured: false };
  const existing = await rest(`automation_rules?site_id=eq.${siteId}&select=*&limit=1`);
  const current = existing?.[0] || defaults;
  const next = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    execution_mode: patch.executionMode ?? current.execution_mode,
    threshold_kwh: patch.thresholdKwh ?? current.threshold_kwh,
    run_at_local: patch.runAtLocal ?? current.run_at_local,
    sunny_redischarge: patch.sunny?.redischarge ?? current.sunny_redischarge,
    sunny_output: patch.sunny?.output ?? current.sunny_output,
    cloudy_redischarge: patch.cloudy?.redischarge ?? current.cloudy_redischarge,
    cloudy_output: patch.cloudy?.output ?? current.cloudy_output,
    conditions: canonicalAutomationConditions(patch.conditions ?? current.conditions ?? defaultConditions(current)),
    notification_preferences: patch.notificationPreferences ?? current.notification_preferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
    updated_at: new Date().toISOString()
  };
  delete next.id;
  const rows = await rest('automation_rules?on_conflict=site_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ site_id: siteId, ...next })
  });
  const persistedRows = await rest(`automation_rules?site_id=eq.${siteId}&select=*&limit=1`);
  const persisted = persistedRows?.[0];
  if (!persisted) throw new Error('La base de datos no confirmó la configuración de automatización.');
  if (patch.conditions && JSON.stringify(canonicalAutomationConditions(persisted.conditions)) !== JSON.stringify(canonicalAutomationConditions(patch.conditions))) {
    throw new Error('La base de datos respondió, pero las condiciones guardadas no coinciden con los cambios solicitados.');
  }
  return { ...normalize(persisted, await extras(siteId)), configured: true, saveVerified: true, verifiedAt: new Date().toISOString() };
}

export async function saveAutomationCredentials(deviceSn, credentialsCipher) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest('automation_credentials?on_conflict=site_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ site_id: siteId, credentials_cipher: credentialsCipher, updated_at: new Date().toISOString() })
  });
  return { configured: Boolean(rows?.[0]?.id), updatedAt: rows?.[0]?.updated_at || null };
}

export async function readAutomationCredentials(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`automation_credentials?site_id=eq.${siteId}&select=credentials_cipher&limit=1`);
  return rows?.[0]?.credentials_cipher || null;
}

export async function savePushSubscription(deviceSn, subscription, userId = null) {
  await ensureSite(deviceSn);
  return await saveUserPushSubscription(subscription, userId);
}

export async function saveUserPushSubscription(subscription, userId) {
  const sites = await rest('solar_sites?select=id') || [];
  const rows = await rest('push_subscriptions?on_conflict=site_id,endpoint', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(sites.map((site) => ({
      site_id: site.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_id: userId || null,
      failure_count: 0
    })))
  });
  return { configured: Boolean(rows?.[0]?.id), sites: rows?.length || 0 };
}

export async function removePushSubscription(deviceSn, endpoint) {
  const siteId = await ensureSite(deviceSn);
  await rest(`push_subscriptions?site_id=eq.${siteId}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
  return { configured: false };
}

export async function listPushSubscriptions(siteId) {
  return await rest(`push_subscriptions?site_id=eq.${siteId}&select=id,endpoint,p256dh,auth,failure_count`) || [];
}

export async function listPushSubscriptionsForUser(userId) {
  const rows = await rest(`push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,endpoint,p256dh,auth,failure_count&order=created_at.desc`) || [];
  const unique = new Map();
  for (const row of rows) if (!unique.has(row.endpoint)) unique.set(row.endpoint, row);
  return [...unique.values()];
}

export async function pushSubscriptionStatus(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`push_subscriptions?site_id=eq.${siteId}&select=id,created_at,last_success_at,failure_count&order=created_at.desc`) || [];
  return {
    configured: rows.length > 0,
    count: rows.length,
    lastSubscribedAt: rows[0]?.created_at || null,
    lastSuccessAt: rows.find((row) => row.last_success_at)?.last_success_at || null,
    failures: rows.reduce((sum, row) => sum + Number(row.failure_count || 0), 0)
  };
}

export async function markPushSuccess(id) {
  await rest(`push_subscriptions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ last_success_at: new Date().toISOString(), failure_count: 0 }) });
}

export async function markPushFailure(id, failureCount) {
  await rest(`push_subscriptions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ failure_count: failureCount }) });
}

export async function deletePushSubscription(id) {
  await rest(`push_subscriptions?id=eq.${id}`, { method: 'DELETE' });
}

export async function listEnabledAutomationRules() {
  const rules = await rest('automation_rules?enabled=eq.true&select=*&order=site_id.asc') || [];
  return await Promise.all(rules.map(async (rule) => {
    const sites = await rest(`solar_sites?id=eq.${rule.site_id}&select=device_sn&limit=1`);
    return { ...normalize(rule), siteId: rule.site_id, deviceSn: sites?.[0]?.device_sn || null };
  }));
}

export async function listNotificationSites() {
  const rules = await rest('automation_rules?select=*&order=site_id.asc') || [];
  const values = [];
  for (const rule of rules) {
    const [sites, subscriptions, credentials] = await Promise.all([
      rest(`solar_sites?id=eq.${rule.site_id}&select=device_sn&limit=1`),
      rest(`push_subscriptions?site_id=eq.${rule.site_id}&select=id&limit=1`),
      rest(`automation_credentials?site_id=eq.${rule.site_id}&select=id&limit=1`)
    ]);
    if (subscriptions?.[0]?.id) values.push({
      ...normalize(rule),
      siteId: rule.site_id,
      deviceSn: sites?.[0]?.device_sn || null,
      credentialsConfigured: Boolean(credentials?.[0]?.id)
    });
  }
  return values;
}

export async function readNotificationState(siteId, eventKey) {
  const rows = await rest(`notification_states?site_id=eq.${siteId}&event_key=eq.${encodeURIComponent(eventKey)}&select=*&limit=1`);
  return rows?.[0] || null;
}

export async function saveNotificationState(siteId, eventKey, state, metadata = {}, lastNotifiedAt = null) {
  const payload = { site_id: siteId, event_key: eventKey, state, metadata, updated_at: new Date().toISOString() };
  if (lastNotifiedAt) payload.last_notified_at = lastNotifiedAt;
  const rows = await rest('notification_states?on_conflict=site_id,event_key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload)
  });
  return rows?.[0] || payload;
}

export async function recordNotificationEvent(siteId, event) {
  const payload = {
    site_id: siteId,
    event_type: event.type,
    title: String(event.title || 'Mi Solar'),
    body: String(event.body || ''),
    dedupe_key: event.dedupeKey || null,
    delivered_count: Number(event.delivered || 0),
    failed_count: Number(event.failed || 0)
  };
  try {
    const rows = await rest('notification_events', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    return rows?.[0] || null;
  } catch (error) {
    if (String(error?.message || '').includes('409')) return null;
    throw error;
  }
}

export async function listNotificationEvents(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const [events, sites] = await Promise.all([
    rest(`notification_events?select=id,site_id,event_type,title,body,delivered_count,failed_count,created_at&order=created_at.desc&limit=${safeLimit}`),
    rest('solar_sites?select=id,name,device_sn')
  ]);
  const siteNames = new Map((sites || []).map((site) => [Number(site.id), site.name || site.device_sn || 'Mi Solar']));
  return (events || []).map((event) => ({
    id: `solar-${event.id}`,
    source: 'solar',
    siteId: Number(event.site_id),
    siteLabel: siteNames.get(Number(event.site_id)) || 'Mi Solar',
    type: event.event_type,
    title: event.title,
    body: event.body,
    createdAt: event.created_at,
    deliveredCount: Number(event.delivered_count || 0),
    failedCount: Number(event.failed_count || 0)
  }));
}

export async function readAutomationExecution(siteId, forecastDate) {
  const rows = await rest(`automation_executions?site_id=eq.${siteId}&forecast_date=eq.${forecastDate}&select=*&limit=1`);
  return rows?.[0] || null;
}

export async function recordAutomationExecution(siteId, execution) {
  const rows = await rest('automation_executions?on_conflict=site_id,forecast_date', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ site_id: siteId, ...execution })
  });
  return rows?.[0] || null;
}

export async function recordConfigurationEvent(deviceSn, event) {
  const siteId = await ensureSite(deviceSn);
  if (!siteId) return { stored: false };
  const rows = await rest('inverter_configuration_events', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      site_id: siteId,
      source: event.source || 'manual',
      preset: event.preset,
      forecast_date: event.forecastDate || null,
      forecast_kwh: Number.isFinite(Number(event.forecastKwh)) ? Number(event.forecastKwh) : null,
      before_config: event.before || {},
      target_config: event.target || {},
      after_config: event.after || {},
      commands: event.commands || {},
      success: Boolean(event.success),
      message: String(event.message || '')
    })
  });
  return { stored: Boolean(rows?.[0]?.id), id: rows?.[0]?.id || null };
}

const ARRAYAN_DEVICE_SN = '96342509120972';
const isConfigurationHistory = (asset) => asset?.extra_specs?.recordType === 'configuration-history';

function configurationHistoryPayload(siteId, configuration, assetsSnapshot, notes, source = 'system') {
  return {
    site_id: siteId,
    category: 'other',
    brand: 'Mi Solar',
    model: `${configuration.label} · ${configuration.installedKwp.toLocaleString('es-CL')} kWp`,
    quantity: 1,
    unit_power_w: null,
    capacity_kwh: null,
    installed_at: configuration.effectiveFrom,
    notes,
    extra_specs: {
      recordType: 'configuration-history',
      configurationKey: configuration.key,
      effectiveFrom: configuration.effectiveFrom,
      effectiveTo: configuration.effectiveTo,
      comparisonUntil: configuration.comparisonUntil,
      installedKwp: configuration.installedKwp,
      panelCount: configuration.panelCount,
      strings: configuration.strings,
      assetsSnapshot,
      source
    },
    updated_at: new Date().toISOString()
  };
}

async function insertHistoryRecord(siteId, configuration, assets, notes, source = 'system') {
  const snapshot = (assets || []).filter((asset) => !isConfigurationHistory(asset)).map((asset) => ({
    category: asset.category,
    brand: asset.brand,
    model: asset.model,
    quantity: Number(asset.quantity || 1),
    unitPowerW: asset.unit_power_w == null ? null : Number(asset.unit_power_w),
    capacityKwh: asset.capacity_kwh == null ? null : Number(asset.capacity_kwh),
    installedAt: asset.installed_at,
    extraSpecs: asset.extra_specs || {},
    notes: asset.notes || ''
  }));
  const rows = await rest('equipment_assets', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify(configurationHistoryPayload(siteId, configuration, snapshot, notes, source))
  });
  return rows?.[0] || null;
}

async function ensureArrayanEquipmentInventory(deviceSn, siteId) {
  if (String(deviceSn) !== ARRAYAN_DEVICE_SN) return;
  let rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const legacy = ARRAYAN_EQUIPMENT_CONFIGURATIONS[0];
  const current = ARRAYAN_EQUIPMENT_CONFIGURATIONS[1];
  const historyKeys = new Set(rows.filter(isConfigurationHistory).map((asset) => asset.extra_specs.configurationKey));

  if (!historyKeys.has(legacy.key)) {
    await insertHistoryRecord(siteId, legacy, rows, 'Configuración anterior conservada para comparar durante al menos un año con el arreglo vigente.', 'migration');
  }

  const currentPanels = rows.filter((asset) => asset.category === 'panel' && asset.extra_specs?.configurationKey === current.key);
  const hasExactPanelInventory = [
    { brand: 'Ulica Solar', quantity: 4, array: 'String 1', orientation: '290° oeste', tilt: '38°' },
    { brand: 'OSDA Solar', quantity: 5, array: 'String 1', orientation: '290° oeste', tilt: '38°' },
    { brand: 'OSDA Solar', quantity: 8, array: 'String 2', orientation: '348° norte', tilt: '20°' }
  ].every((expected) => currentPanels.some((asset) =>
    asset.brand === expected.brand && Number(asset.quantity) === expected.quantity && Number(asset.unit_power_w) === 620 &&
    asset.extra_specs?.array === expected.array && asset.extra_specs?.orientation === expected.orientation && asset.extra_specs?.tilt === expected.tilt
  ));
  if (currentPanels.length !== 3 || !hasExactPanelInventory) {
    await rest(`equipment_assets?site_id=eq.${siteId}&category=eq.panel`, { method: 'DELETE' });
    const panelRows = [
      {
        site_id: siteId, category: 'panel', brand: 'Ulica Solar', model: 'TOPCon N-Type', quantity: 4, unit_power_w: 620, capacity_kwh: null, installed_at: current.effectiveFrom,
        notes: 'String 1 · techo viejo. Orientación 290° oeste e inclinación 38°.',
        extra_specs: { technology: 'N-Type TOPCon', array: 'String 1', roofLocation: 'Techo viejo', orientation: '290° oeste', tilt: '38°', connection: '4 paneles en serie dentro del String 1', configurationKey: current.key }
      },
      {
        site_id: siteId, category: 'panel', brand: 'OSDA Solar', model: 'ODA620-33V-MHDRz', quantity: 5, unit_power_w: 620, capacity_kwh: null, installed_at: current.effectiveFrom,
        notes: 'String 1 · techo viejo. Comparte orientación 290° oeste e inclinación 38° con los 4 paneles Ulica.',
        extra_specs: { technology: 'Monocristalino 620 W', array: 'String 1', roofLocation: 'Techo viejo', orientation: '290° oeste', tilt: '38°', nominalVoltage: 'Vmp 41,46 V', nominalCurrent: 'Imp 14,96 A', maximumVoltage: 'Voc 48,78 V', connection: '5 paneles en serie dentro del String 1', configurationKey: current.key }
      },
      {
        site_id: siteId, category: 'panel', brand: 'OSDA Solar', model: 'ODA620-33V-MHDRz', quantity: 8, unit_power_w: 620, capacity_kwh: null, installed_at: current.effectiveFrom,
        notes: 'String 2 · techo motos. Orientación 348° norte e inclinación 20°.',
        extra_specs: { technology: 'Monocristalino 620 W', array: 'String 2', roofLocation: 'Techo motos', orientation: '348° norte', tilt: '20°', nominalVoltage: 'Vmp 41,46 V', nominalCurrent: 'Imp 14,96 A', maximumVoltage: 'Voc 48,78 V', connection: '8 paneles en serie en el String 2', configurationKey: current.key }
      }
    ];
    await rest('equipment_assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(panelRows) });
  }

  rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const pylontechRows = rows.filter((asset) => asset.category === 'battery' && /pylontech/i.test(`${asset.brand} ${asset.model}`));
  const pylontech = pylontechRows[0];
  const batteryPayload = {
    site_id: siteId, category: 'battery', brand: 'Pylontech', model: 'UF5000', quantity: 4, unit_power_w: null, capacity_kwh: 5.12,
    notes: '4 baterías Pylontech UF5000 en paralelo · 20,48 kWh nominales y 19,456 kWh utilizables al 95% de profundidad de descarga. Cada módulo: 51,2 V, 100 Ah, 5,12 kWh nominales y 4,864 kWh utilizables.',
    extra_specs: { ...(pylontech?.extra_specs || {}), technology: 'LiFePO₄', nominalVoltage: '51,2 V', nominalCurrent: '100 A recomendados por módulo', maximumVoltage: 'Carga 56–56,8 V', connection: '4 baterías en paralelo', configurationKey: current.key },
    updated_at: new Date().toISOString()
  };
  if (pylontech?.id) {
    await rest(`equipment_assets?id=eq.${Number(pylontech.id)}&site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(batteryPayload) });
  } else {
    await rest('equipment_assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(batteryPayload) });
  }
  for (const duplicate of pylontechRows.slice(1)) {
    await rest(`equipment_assets?id=eq.${Number(duplicate.id)}&site_id=eq.${siteId}`, { method: 'DELETE' });
  }

  rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const inverterRows = rows.filter((asset) => asset.category === 'inverter');
  const inverter = inverterRows[0];
  const inverterPayload = {
    site_id: siteId, category: 'inverter', brand: 'Voltronic Power / Neutral', model: 'Axpert VM II Premium Plus 12K 48V', quantity: 1, unit_power_w: 12000, capacity_kwh: null,
    notes: '12 kW / 12 kVA nominales · sobretensión 24 kVA · eficiencia máxima 93% · 2 MPPT de 7,5 kW · 15 kW FV total · rango MPPT 90–450 Vdc · Voc máximo 500 Vdc · 27 A por MPPT · carga máxima 180 A · doble salida AC · RS232/RS485(BMS)/Wi‑Fi.',
    extra_specs: { ...(inverter?.extra_specs || {}), technology: 'Inversor solar off-grid de onda senoidal pura', nominalVoltage: '230 Vac · batería 48 Vdc', nominalCurrent: 'PV máximo 27 A × 2 MPPT', maximumVoltage: 'Voc FV 500 Vdc · MPPT 90–450 Vdc', connection: 'String 1 a MPPT 1 · String 2 a MPPT 2', configurationKey: current.key },
    updated_at: new Date().toISOString()
  };
  if (inverter?.id) {
    await rest(`equipment_assets?id=eq.${Number(inverter.id)}&site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(inverterPayload) });
  } else {
    await rest('equipment_assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(inverterPayload) });
  }
  for (const duplicate of inverterRows.slice(1)) {
    await rest(`equipment_assets?id=eq.${Number(duplicate.id)}&site_id=eq.${siteId}`, { method: 'DELETE' });
  }

  rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const currentHistory = rows.find((asset) => isConfigurationHistory(asset) && asset.extra_specs.configurationKey === current.key);
  const historyNotes = '17 paneles desde el 1 de octubre de 2026: String 1 de 9 × 620 W y String 2 de 8 × 620 W. Banco verificado y corregido: 4 Pylontech UF5000 en paralelo (20,48 kWh nominales; 19,456 kWh utilizables). Inversor Axpert VM II Premium Plus 12K 48V con dos MPPT.';
  if (!currentHistory) {
    await insertHistoryRecord(siteId, current, rows, historyNotes, 'migration');
  } else if (!/UF5000/.test(String(currentHistory.notes || ''))) {
    const snapshot = rows.filter((asset) => !isConfigurationHistory(asset)).map((asset) => ({
      category: asset.category, brand: asset.brand, model: asset.model, quantity: Number(asset.quantity || 1),
      unitPowerW: asset.unit_power_w == null ? null : Number(asset.unit_power_w), capacityKwh: asset.capacity_kwh == null ? null : Number(asset.capacity_kwh),
      installedAt: asset.installed_at, extraSpecs: asset.extra_specs || {}, notes: asset.notes || ''
    }));
    await rest(`equipment_assets?id=eq.${Number(currentHistory.id)}&site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(configurationHistoryPayload(siteId, current, snapshot, historyNotes, 'data-correction')) });
  }
}

async function ensurePuertoMonttEquipmentInventory(deviceSn, siteId) {
  // La interfaz trabaja normalmente con la referencia estable `site:3` y la
  // tabla solar_sites puede conservar un identificador histórico distinto al
  // número de serie vigente. El site_id es la identidad canónica del archivo,
  // por lo que también lo reconocemos explícitamente para no dejar vacío el
  // inventario de Puerto Montt cuando la resolución del alias no coincide.
  if (String(deviceSn) !== '96322507118828' && Number(siteId) !== 3) return;
  let rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const previous = PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS[0];
  const current = PUERTO_MONTT_EQUIPMENT_CONFIGURATIONS[1];
  const historyKeys = new Set(rows.filter(isConfigurationHistory).map((asset) => asset.extra_specs.configurationKey));
  if (!historyKeys.has(previous.key)) {
    await insertHistoryRecord(siteId, previous, rows, 'Configuración anterior de Puerto Montt: 3 paneles JA Solar de 615 W en serie, 1,845 kWp.', 'migration');
  }

  const panels = rows.filter((asset) => asset.category === 'panel' && !isConfigurationHistory(asset));
  const panel = panels[0];
  const panelPayload = {
    site_id: siteId, category: 'panel', brand: 'JA Solar', model: panel?.model || 'Panel FV 615 W', quantity: 6, unit_power_w: 615, capacity_kwh: null,
    installed_at: current.effectiveFrom,
    notes: '6 paneles JA Solar de 615 W conectados en una sola serie · potencia FV total 3,69 kWp.',
    extra_specs: { ...(panel?.extra_specs || {}), technology: 'Fotovoltaico', array: 'String único', connection: '6 paneles en serie', configurationKey: current.key },
    updated_at: new Date().toISOString()
  };
  if (!panel || Number(panel.quantity) !== 6 || Number(panel.unit_power_w) !== 615 || panel.installed_at !== current.effectiveFrom || panel.extra_specs?.configurationKey !== current.key) {
    if (panel?.id) await rest(`equipment_assets?id=eq.${Number(panel.id)}&site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(panelPayload) });
    else await rest('equipment_assets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(panelPayload) });
  }
  rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  let currentHistory = rows.find((asset) => isConfigurationHistory(asset) && asset.extra_specs.configurationKey === current.key);
  const mistakenHistory = rows.find((asset) => isConfigurationHistory(asset) && asset.extra_specs.configurationKey === 'puerto-montt-v2-1290');
  if (!currentHistory && mistakenHistory) {
    const snapshot = rows.filter((asset) => !isConfigurationHistory(asset)).map((asset) => ({
      category: asset.category, brand: asset.brand, model: asset.model, quantity: Number(asset.quantity || 1),
      unitPowerW: asset.unit_power_w == null ? null : Number(asset.unit_power_w), capacityKwh: asset.capacity_kwh == null ? null : Number(asset.capacity_kwh),
      installedAt: asset.installed_at, extraSpecs: asset.extra_specs || {}, notes: asset.notes || ''
    }));
    await rest(`equipment_assets?id=eq.${Number(mistakenHistory.id)}&site_id=eq.${siteId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(configurationHistoryPayload(siteId, current, snapshot, 'Rectificación final confirmada: desde el 18 de septiembre de 2026 Puerto Montt tiene 6 paneles JA Solar de 615 W en serie, 3,69 kWp.', 'data-correction'))
    });
    currentHistory = mistakenHistory;
  }
  // Normaliza también las fechas de los registros existentes. Una versión
  // anterior creó ambos cortes el día de la rectificación y eso hacía parecer
  // que el arreglo de seis paneles comenzaba en octubre, aunque rige desde el
  // 18 de septiembre.
  rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const previousHistory = rows.find((asset) => isConfigurationHistory(asset) && asset.extra_specs.configurationKey === previous.key);
  if (previousHistory && (
    previousHistory.extra_specs?.effectiveFrom !== previous.effectiveFrom ||
    previousHistory.extra_specs?.effectiveTo !== previous.effectiveTo ||
    Number(previousHistory.extra_specs?.installedKwp) !== previous.installedKwp
  )) {
    await rest(`equipment_assets?id=eq.${Number(previousHistory.id)}&site_id=eq.${siteId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(configurationHistoryPayload(
        siteId,
        previous,
        previousHistory.extra_specs?.assetsSnapshot || [],
        'Configuración anterior de Puerto Montt: 3 paneles JA Solar de 615 W en serie, 1,845 kWp.',
        'data-correction'
      ))
    });
  }

  currentHistory = rows.find((asset) => isConfigurationHistory(asset) && asset.extra_specs.configurationKey === current.key);
  const currentNotes = 'Configuración vigente de Puerto Montt: 6 paneles JA Solar de 615 W en una sola serie, 3,69 kWp.';
  if (!currentHistory) {
    await insertHistoryRecord(siteId, current, rows, currentNotes, 'equipment-update');
  } else if (
    currentHistory.extra_specs?.effectiveFrom !== current.effectiveFrom ||
    currentHistory.extra_specs?.effectiveTo !== current.effectiveTo ||
    Number(currentHistory.extra_specs?.installedKwp) !== current.installedKwp ||
    Number(currentHistory.extra_specs?.panelCount) !== current.panelCount ||
    !/615 W/.test(String(currentHistory.notes || ''))
  ) {
    const snapshot = rows.filter((asset) => !isConfigurationHistory(asset)).map((asset) => ({
      category: asset.category, brand: asset.brand, model: asset.model, quantity: Number(asset.quantity || 1),
      unitPowerW: asset.unit_power_w == null ? null : Number(asset.unit_power_w), capacityKwh: asset.capacity_kwh == null ? null : Number(asset.capacity_kwh),
      installedAt: asset.installed_at, extraSpecs: asset.extra_specs || {}, notes: asset.notes || ''
    }));
    await rest(`equipment_assets?id=eq.${Number(currentHistory.id)}&site_id=eq.${siteId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(configurationHistoryPayload(siteId, current, snapshot, currentNotes, 'data-correction'))
    });
  }
}

async function recordManualEquipmentHistory(deviceSn, siteId, summary) {
  const assets = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=created_at.asc`) || [];
  const panels = assets.filter((asset) => asset.category === 'panel' && !isConfigurationHistory(asset));
  const batteries = assets.filter((asset) => asset.category === 'battery' && !isConfigurationHistory(asset));
  const installedKwp = panels.reduce((sum, asset) => sum + Number(asset.quantity || 0) * Number(asset.unit_power_w || 0), 0) / 1000;
  const configuration = {
    key: `manual-${Date.now()}`,
    label: 'Modificación manual',
    effectiveFrom: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }),
    effectiveTo: null,
    comparisonUntil: null,
    installedKwp,
    panelCount: panels.reduce((sum, asset) => sum + Number(asset.quantity || 0), 0),
    strings: panels.map((asset) => ({ label: asset.extra_specs?.array || asset.model, panelCount: Number(asset.quantity || 0), orientation: asset.extra_specs?.orientation || null, tilt: asset.extra_specs?.tilt || null }))
  };
  await insertHistoryRecord(siteId, configuration, assets, `${summary}. Baterías registradas: ${batteries.reduce((sum, asset) => sum + Number(asset.quantity || 0), 0)}.`, 'manual');
}

export async function listEquipment(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  await ensureArrayanEquipmentInventory(resolvedDeviceSn, siteId);
  await ensurePuertoMonttEquipmentInventory(resolvedDeviceSn, siteId);
  const rows = await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=category.asc,created_at.asc`) || [];
  return rows.filter((asset) => !isConfigurationHistory(asset));
}

export async function listEquipmentHistory(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const resolvedDeviceSn = await resolveDeviceReference(deviceSn) || String(deviceSn);
  await ensureArrayanEquipmentInventory(resolvedDeviceSn, siteId);
  await ensurePuertoMonttEquipmentInventory(resolvedDeviceSn, siteId);
  const rows = await rest(`equipment_assets?site_id=eq.${siteId}&category=eq.other&select=*&order=created_at.desc`) || [];
  return rows.filter(isConfigurationHistory);
}

export async function saveEquipment(deviceSn, asset) {
  const siteId = await ensureSite(deviceSn);
  const payload = {
    site_id: siteId,
    category: asset.category,
    brand: asset.brand || '',
    model: asset.model || '',
    quantity: Number(asset.quantity || 1),
    unit_power_w: asset.unitPowerW == null || asset.unitPowerW === '' ? null : Number(asset.unitPowerW),
    capacity_kwh: asset.capacityKwh == null || asset.capacityKwh === '' ? null : Number(asset.capacityKwh),
    extra_specs: asset.extraSpecs && typeof asset.extraSpecs === 'object' ? asset.extraSpecs : {},
    installed_at: asset.installedAt || null,
    notes: asset.notes || '',
    updated_at: new Date().toISOString()
  };
  if (asset.id) {
    const rows = await rest(`equipment_assets?id=eq.${Number(asset.id)}&site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    const saved = rows?.[0] || null;
    await recordManualEquipmentHistory(deviceSn, siteId, `Se editó ${asset.brand || ''} ${asset.model || asset.category}`.trim()).catch(() => undefined);
    return saved;
  }
  const rows = await rest('equipment_assets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  const saved = rows?.[0] || null;
  await recordManualEquipmentHistory(deviceSn, siteId, `Se agregó ${asset.brand || ''} ${asset.model || asset.category}`.trim()).catch(() => undefined);
  return saved;
}

export async function deleteEquipment(deviceSn, id) {
  const siteId = await ensureSite(deviceSn);
  const previous = await rest(`equipment_assets?id=eq.${Number(id)}&site_id=eq.${siteId}&select=brand,model,category&limit=1`);
  await rest(`equipment_assets?id=eq.${Number(id)}&site_id=eq.${siteId}`, { method: 'DELETE' });
  const asset = previous?.[0];
  await recordManualEquipmentHistory(deviceSn, siteId, `Se eliminó ${asset?.brand || ''} ${asset?.model || asset?.category || 'un equipo'}`.trim()).catch(() => undefined);
  return { deleted: true };
}
