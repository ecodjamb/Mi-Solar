let requestQueue: Promise<unknown> = Promise.resolve();

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function executeOnce<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Error ${response.status}`) as Error & { status?: number; details?: unknown };
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError = new Error('La consulta demoró demasiado.') as Error & { status?: number };
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function execute<T>(path: string, options: RequestInit = {}): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await executeOnce<T>(path, options);
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      const retryable = status == null || RETRYABLE_STATUS.has(status);
      if (!retryable || attempt === 2) break;
      await sleep(700 * (attempt + 1));
    }
  }
  throw lastError;
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
