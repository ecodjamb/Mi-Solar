import { ensureSite, rest } from './archive.js';

const defaults = {
  enabled: false,
  execution_mode: 'manual',
  threshold_kwh: 20,
  run_at_local: '22:00',
  sunny_redischarge: 25,
  sunny_output: 'SBU',
  cloudy_redischarge: 50,
  cloudy_output: 'SOL',
  conditions: []
};

function defaultConditions(row) {
  const threshold = Number(row?.threshold_kwh ?? 20);
  const runAtLocal = String(row?.run_at_local || '22:00').slice(0, 5);
  return [
    { id: 'cloudy-default', enabled: true, kind: 'lessThan', minKwh: 0, maxKwh: threshold, preset: 'cloudy', runAtLocal, dayOffset: -1 },
    { id: 'sunny-default', enabled: true, kind: 'between', minKwh: threshold, maxKwh: 60, preset: 'sunny', runAtLocal, dayOffset: -1 }
  ];
}

function normalize(row, extras = {}) {
  return {
    enabled: Boolean(row?.enabled),
    executionMode: row?.execution_mode || 'manual',
    thresholdKwh: Number(row?.threshold_kwh ?? 20),
    runAtLocal: String(row?.run_at_local || '22:00').slice(0, 5),
    sunny: { redischarge: Number(row?.sunny_redischarge ?? 25), output: row?.sunny_output || 'SBU' },
    cloudy: { redischarge: Number(row?.cloudy_redischarge ?? 50), output: row?.cloudy_output || 'SOL' },
    conditions: Array.isArray(row?.conditions) && row.conditions.length ? row.conditions : defaultConditions(row),
    updatedAt: row?.updated_at || null,
    credentialsConfigured: Boolean(extras.credentialsConfigured),
    notificationsConfigured: Boolean(extras.notificationsConfigured),
    lastExecution: extras.lastExecution || null
  };
}

async function extras(siteId) {
  const [credentials, subscriptions, executions] = await Promise.all([
    rest(`automation_credentials?site_id=eq.${siteId}&select=id&limit=1`),
    rest(`push_subscriptions?site_id=eq.${siteId}&select=id&limit=1`),
    rest(`automation_executions?site_id=eq.${siteId}&select=forecast_date,evaluated_at,forecast_kwh,preset,action,message,notified&order=evaluated_at.desc&limit=1`)
  ]);
  return {
    credentialsConfigured: Boolean(credentials?.[0]?.id),
    notificationsConfigured: Boolean(subscriptions?.[0]?.id),
    lastExecution: executions?.[0] || null
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
    conditions: patch.conditions ?? current.conditions ?? defaultConditions(current),
    updated_at: new Date().toISOString()
  };
  delete next.id;
  const rows = await rest('automation_rules?on_conflict=site_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ site_id: siteId, ...next })
  });
  return { ...normalize(rows?.[0] || next, await extras(siteId)), configured: true };
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

export async function savePushSubscription(deviceSn, subscription) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest('push_subscriptions?on_conflict=site_id,endpoint', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      site_id: siteId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      failure_count: 0
    })
  });
  return { configured: Boolean(rows?.[0]?.id) };
}

export async function removePushSubscription(deviceSn, endpoint) {
  const siteId = await ensureSite(deviceSn);
  await rest(`push_subscriptions?site_id=eq.${siteId}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
  return { configured: false };
}

export async function listPushSubscriptions(siteId) {
  return await rest(`push_subscriptions?site_id=eq.${siteId}&select=id,endpoint,p256dh,auth,failure_count`) || [];
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

export async function listEquipment(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  return await rest(`equipment_assets?site_id=eq.${siteId}&select=*&order=category.asc,created_at.asc`) || [];
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
    installed_at: asset.installedAt || null,
    notes: asset.notes || '',
    updated_at: new Date().toISOString()
  };
  if (asset.id) {
    const rows = await rest(`equipment_assets?id=eq.${Number(asset.id)}&site_id=eq.${siteId}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
    return rows?.[0] || null;
  }
  const rows = await rest('equipment_assets', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  return rows?.[0] || null;
}

export async function deleteEquipment(deviceSn, id) {
  const siteId = await ensureSite(deviceSn);
  await rest(`equipment_assets?id=eq.${Number(id)}&site_id=eq.${siteId}`, { method: 'DELETE' });
  return { deleted: true };
}
