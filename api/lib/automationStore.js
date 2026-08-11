import { ensureSite, rest } from './archive.js';

const defaults = {
  enabled: false,
  execution_mode: 'manual',
  threshold_kwh: 20,
  run_at_local: '22:00',
  sunny_redischarge: 25,
  sunny_output: 'SBU',
  cloudy_redischarge: 50,
  cloudy_output: 'SOL'
};

function normalize(row) {
  return {
    enabled: Boolean(row?.enabled),
    executionMode: row?.execution_mode || 'manual',
    thresholdKwh: Number(row?.threshold_kwh ?? 20),
    runAtLocal: String(row?.run_at_local || '22:00').slice(0, 5),
    sunny: { redischarge: Number(row?.sunny_redischarge ?? 25), output: row?.sunny_output || 'SBU' },
    cloudy: { redischarge: Number(row?.cloudy_redischarge ?? 50), output: row?.cloudy_output || 'SOL' },
    updatedAt: row?.updated_at || null
  };
}

export async function readAutomationRule(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  if (!siteId) return { ...normalize(defaults), configured: false };
  const rows = await rest(`automation_rules?site_id=eq.${siteId}&select=*&limit=1`);
  if (rows?.[0]) return { ...normalize(rows[0]), configured: true };
  const created = await rest('automation_rules', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, ...defaults })
  });
  return { ...normalize(created?.[0] || defaults), configured: true };
}

export async function updateAutomationRule(deviceSn, enabled) {
  const siteId = await ensureSite(deviceSn);
  if (!siteId) return { ...normalize({ ...defaults, enabled }), configured: false };
  const rows = await rest('automation_rules?on_conflict=site_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ site_id: siteId, ...defaults, enabled: Boolean(enabled), updated_at: new Date().toISOString() })
  });
  return { ...normalize(rows?.[0] || { ...defaults, enabled }), configured: true };
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
