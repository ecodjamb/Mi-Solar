import { rest } from './archive.js';

const ALLOWED = new Set(['provider','identity','family','family_access']);

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
