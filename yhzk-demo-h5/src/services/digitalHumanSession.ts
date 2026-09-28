export interface DigitalHumanSessionSnapshot {
  sessionId: string;
  controlToken: string;
  streamUrl: string;
  expiresAt: string;
}

export interface DigitalHumanSessionCapability {
  readonly snapshot: DigitalHumanSessionSnapshot;
  isCurrent: () => boolean;
  speak: (text: string, options?: Record<string, unknown>) => Promise<unknown>;
  interrupt: () => Promise<unknown>;
  pollSubtitleEvents: (after?: number) => Promise<unknown[]>;
}

interface ClientDependencies {
  fetcher?: typeof fetch;
  getToken?: () => string;
  apiBase?: string;
  clientInstanceId?: string;
  onSnapshot?: (snapshot: DigitalHumanSessionSnapshot | null) => void;
  onAuthenticationLost?: () => void;
}

interface PendingCreate {
  token: string;
  targetGeneration: number | null;
  promise: Promise<DigitalHumanSessionSnapshot | null>;
}

export class DigitalHumanRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DigitalHumanRequestError';
    this.status = status;
  }
}

function unwrap<T>(payload: { data?: T } & Partial<T>): T {
  return (payload.data ?? payload) as T;
}

function randomInstanceId(): string {
  const cryptoApi = globalThis.crypto as Crypto & {
    randomUUID?: () => string;
  } | undefined;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID().replace(/-/g, '');
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createDigitalHumanSessionClient(dependencies: ClientDependencies = {}) {
  const fetcher = dependencies.fetcher ?? fetch;
  const getToken = dependencies.getToken ?? (() => globalThis.localStorage?.getItem('yhzk_token') ?? '');
  const apiBase = dependencies.apiBase ?? '/api/v1';
  const clientInstanceId = dependencies.clientInstanceId ?? randomInstanceId();
  let current: DigitalHumanSessionSnapshot | null = null;
  let currentToken = '';
  let generation = 0;
  let pending: PendingCreate | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const controlRequests = new Set<AbortController>();

  const notifySnapshot = () => dependencies.onSnapshot?.(current);

  const headers = (
    token: string,
    session?: DigitalHumanSessionSnapshot,
  ): Record<string, string> => {
    const value: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (session) {
      value['X-Digital-Human-Session'] = session.sessionId;
      value['X-Digital-Human-Control'] = session.controlToken;
    }
    return value;
  };

  const request = async <T>(
    path: string,
    init: RequestInit,
    session: DigitalHumanSessionSnapshot | undefined,
    token: string,
    signal?: AbortSignal,
  ): Promise<T> => {
    if (!token) throw new DigitalHumanRequestError(401, 'not authenticated');
    const response = await fetcher(`${apiBase}/digital-human${path}`, {
      ...init,
      credentials: 'include',
      signal,
      headers: { ...headers(token, session), ...(init.headers ?? {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new DigitalHumanRequestError(
        response.status,
        payload.message || `数字人请求失败 (${response.status})`,
      );
    }
    return unwrap<T>(payload);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const stopReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const abortControlRequests = () => {
    for (const controller of controlRequests) controller.abort();
    controlRequests.clear();
  };

  const clearCurrent = () => {
    const changed = current !== null;
    current = null;
    currentToken = '';
    stopHeartbeat();
    abortControlRequests();
    if (changed) notifySnapshot();
  };

  const invalidate = () => {
    generation += 1;
    if (pending) pending.targetGeneration = null;
    stopReconnect();
    clearCurrent();
  };

  const closeSnapshot = async (snapshot: DigitalHumanSessionSnapshot, token: string) => {
    await request('/session', { method: 'DELETE' }, snapshot, token).catch(() => undefined);
  };

  const scheduleReconnect = (token: string) => {
    stopReconnect();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (getToken() !== token || current) return;
      void connect().catch(() => undefined);
    }, 500);
  };

  const handleSessionError = (
    error: unknown,
    captured: DigitalHumanSessionSnapshot,
    capturedGeneration: number,
    token: string,
  ) => {
    if (!(error instanceof DigitalHumanRequestError)
      || current !== captured || generation !== capturedGeneration) return;
    if (error.status === 401) {
      invalidate();
      dependencies.onAuthenticationLost?.();
    } else if ([403, 404, 410].includes(error.status)) {
      invalidate();
      scheduleReconnect(token);
    }
  };

  const runCaptured = async <T>(
    captured: DigitalHumanSessionSnapshot,
    capturedGeneration: number,
    token: string,
    path: string,
    init: RequestInit,
  ): Promise<T> => {
    if (current !== captured || generation !== capturedGeneration || getToken() !== token) {
      throw new Error('stale digital-human session capability');
    }
    const controller = new AbortController();
    controlRequests.add(controller);
    try {
      return await request<T>(path, init, captured, token, controller.signal);
    } catch (error) {
      handleSessionError(error, captured, capturedGeneration, token);
      throw error;
    } finally {
      controlRequests.delete(controller);
    }
  };

  const startHeartbeat = (
    captured: DigitalHumanSessionSnapshot,
    capturedGeneration: number,
    token: string,
  ) => {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (generation !== capturedGeneration || current !== captured) return;
      void runCaptured(
        captured,
        capturedGeneration,
        token,
        '/session/heartbeat',
        { method: 'POST', body: '{}' },
      ).catch(() => undefined);
    }, 30_000);
  };

  const adopt = (
    created: DigitalHumanSessionSnapshot,
    token: string,
    targetGeneration: number,
  ) => {
    current = created;
    currentToken = token;
    startHeartbeat(created, targetGeneration, token);
    notifySnapshot();
  };

  const connect = (): Promise<DigitalHumanSessionSnapshot | null> => {
    const token = getToken();
    if (!token) return Promise.resolve(null);
    if (current && currentToken === token) return Promise.resolve(current);
    if (current && currentToken !== token) invalidate();
    if (pending?.token === token) {
      pending.targetGeneration = generation;
      return pending.promise;
    }
    if (pending) pending.targetGeneration = null;

    const operation = { token, targetGeneration: generation } as PendingCreate;
    operation.promise = request<DigitalHumanSessionSnapshot>(
      '/session',
      { method: 'POST', body: JSON.stringify({ clientInstanceId }) },
      undefined,
      token,
    ).then(async (created) => {
      if (!created?.sessionId || !created.controlToken || !created.streamUrl) {
        throw new Error('数字人会话响应不完整');
      }
      const targetGeneration = operation.targetGeneration;
      if (pending === operation) pending = null;
      if (targetGeneration !== null && targetGeneration === generation && getToken() === token) {
        adopt(created, token, targetGeneration);
        return created;
      }
      await closeSnapshot(created, token);
      return current;
    }).catch((error) => {
      if (pending === operation) pending = null;
      if (operation.targetGeneration === generation
        && error instanceof DigitalHumanRequestError && error.status === 401) {
        dependencies.onAuthenticationLost?.();
      }
      throw error;
    });
    pending = operation;
    return operation.promise;
  };

  const capture = (): DigitalHumanSessionCapability | null => {
    const captured = current;
    const token = currentToken;
    const capturedGeneration = generation;
    if (!captured || !token) return null;
    const isCurrent = () => current === captured
      && generation === capturedGeneration
      && currentToken === token
      && getToken() === token;
    return {
      snapshot: captured,
      isCurrent,
      speak(text: string, options: Record<string, unknown> = {}) {
        return runCaptured(
          captured,
          capturedGeneration,
          token,
          '/session/speak',
          { method: 'POST', body: JSON.stringify({ text, ...options }) },
        );
      },
      interrupt() {
        return runCaptured(
          captured,
          capturedGeneration,
          token,
          '/session/interrupt',
          { method: 'POST', body: '{}' },
        );
      },
      async pollSubtitleEvents(after = 0) {
        const result = await runCaptured<{
          events?: unknown[];
          data?: { events?: unknown[] };
        }>(
          captured,
          capturedGeneration,
          token,
          `/session/subtitles?after=${Math.max(0, after)}`,
          { method: 'GET' },
        );
        if (!isCurrent()) return [];
        return result.events ?? result.data?.events ?? [];
      },
    };
  };

  const disconnect = async () => {
    const captured = current;
    const token = currentToken || pending?.token || getToken();
    invalidate();
    if (captured && token) await closeSnapshot(captured, token);
  };

  return {
    connect,
    capture,
    invalidate,
    disconnect,
    snapshot: () => current,
    async speak(text: string, options: Record<string, unknown> = {}) {
      const capability = capture();
      if (!capability) throw new Error('数字人会话尚未就绪');
      return capability.speak(text, options);
    },
    async interrupt() {
      const capability = capture();
      if (!capability) return;
      return capability.interrupt();
    },
    async pollSubtitleEvents(after = 0) {
      const capability = capture();
      if (!capability) return [];
      return capability.pollSubtitleEvents(after);
    },
  };
}
