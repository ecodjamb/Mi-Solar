import { rest } from './archive.js';

const ALLOWED = new Set(['provider','identity','family']);

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
