let requestQueue: Promise<unknown> = Promise.resolve();

async function execute<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('La consulta demoró demasiado. Se volverá a intentar automáticamente.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Tumcapp puede renovar el token en cada respuesta. Serializamos las consultas
 * para evitar que dos respuestas paralelas sobrescriban la cookie con tokens
 * incompatibles y dejen el dashboard sin datos.
 */
export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const job = requestQueue.then(() => execute<T>(path, options));
  requestQueue = job.catch(() => undefined);
  return job;
}
