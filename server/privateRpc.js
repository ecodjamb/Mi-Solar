import { rest } from './archive.js';

const ALLOWED = new Set(['provider','identity','family','family_access','family_mutations','tuya_rules']);

export async function privateRpc(namespace, operation, payload = {}) {
  if (!ALLOWED.has(namespace)) throw new Error('RPC privado no permitido.');
  return await rest(`rpc/misolar_${namespace}_backend`, {
    method: 'POST',
    body: JSON.stringify({ p_operation: operation, p_payload: payload })
  });
}

export async function privatePasswordChange(payload) {
  return await rest('rpc/misolar_password_change_backend', {
    method: 'POST',
    body: JSON.stringify({ p_payload: payload })
  });
}

export async function privateFamilyMovementUpdate(payload) {
  return await rest('rpc/misolar_family_movement_update_backend', {
    method: 'POST',
    body: JSON.stringify({
      p_movement_id: Number(payload.movement_id), p_movement_date: payload.movement_date,
      p_detail: payload.detail, p_income_minor: Number(payload.income_minor),
      p_expense_minor: Number(payload.expense_minor), p_merchant_name: payload.merchant_name || null
    })
  });
}

export async function privateProviderSyncClaim({ siteId, provider, minimumSeconds = 90, force = false }) {
  return await rest('rpc/misolar_provider_sync_claim_backend', {
    method: 'POST',
    body: JSON.stringify({
      p_site_id: Number(siteId),
      p_provider: String(provider || ''),
      p_minimum_seconds: Math.max(30, Number(minimumSeconds) || 90),
      p_force: Boolean(force)
    })
  });
}
