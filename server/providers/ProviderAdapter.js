export class ProviderError extends Error {
  constructor(message, { code = 'PROVIDER_ERROR', status = 502, retryable = false, details = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

/**
 * Contrato interno de proveedores. Cada implementación debe devolver datos
 * crudos; la normalización y la persistencia se realizan fuera del adaptador.
 */
export class ProviderAdapter {
  constructor(name, { readOnly = true } = {}) {
    if (new.target === ProviderAdapter) throw new TypeError('ProviderAdapter es una interfaz abstracta.');
    this.name = name;
    this.readOnly = readOnly;
  }

  async authenticate() { throw new Error('authenticate() no implementado.'); }
  async refreshSession() { throw new Error('refreshSession() no implementado.'); }
  async validateCredentials(credentials) {
    const session = await this.authenticate(credentials);
    return { ok: true, session };
  }
  async listSites() { throw new Error('listSites() no implementado.'); }
  async listDevices() { throw new Error('listDevices() no implementado.'); }
  async getRealtimeData() { throw new Error('getRealtimeData() no implementado.'); }
  async getHistory() { throw new Error('getHistory() no implementado.'); }
  async getAlarms() { throw new Error('getAlarms() no implementado.'); }
  async getDeviceInfo() { throw new Error('getDeviceInfo() no implementado.'); }
  async getRatedInfo() { throw new Error('getRatedInfo() no implementado.'); }
  async getSettings() { throw new Error('getSettings() no implementado.'); }
  async healthCheck() { throw new Error('healthCheck() no implementado.'); }
  async disconnect() { return { ok: true }; }
}
