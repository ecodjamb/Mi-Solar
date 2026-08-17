type QueueTask = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const priorityQueue: QueueTask[] = [];
const normalQueue: QueueTask[] = [];
let requestRunning = false;

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function executeOnce<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), path.endsWith('/utility-bills/extract') ? 60_000 : 30_000);
  try {
    const response = await fetch(`/api/${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== 'login') window.dispatchEvent(new CustomEvent('misolar:auth-expired'));
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

function drainQueue() {
  if (requestRunning) return;
  const task = priorityQueue.shift() || normalQueue.shift();
  if (!task) return;
  requestRunning = true;
  task.run().then(task.resolve, task.reject).finally(() => {
    requestRunning = false;
    drainQueue();
  });
}

function enqueue<T>(path: string, options: RequestInit, priority: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const task: QueueTask = {
      run: () => execute<T>(path, options),
      resolve: (value) => resolve(value as T),
      reject
    };
    (priority ? priorityQueue : normalQueue).push(task);
    drainQueue();
  });
}

/**
 * Tumcapp puede renovar el token en cada respuesta. Se mantiene una sola
 * solicitud activa, pero las lecturas instantáneas saltan delante del trabajo
 * histórico pendiente para que la pantalla nunca espere una descarga larga.
 */
export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return enqueue<T>(path, options, false);
}

export function apiLive<T>(path: string, options: RequestInit = {}): Promise<T> {
  return enqueue<T>(path, options, true);
}
