/**
 * Outbound HTTP with a hard deadline (finding C-D30).
 *
 * Node's `fetch` has NO default timeout. Every outbound call in this codebase —
 * Azure OpenAI, Azure Document Intelligence, Ollama, OpenAI, Melento — was
 * issued without an `AbortSignal`, so a provider that accepts the connection and
 * then stalls holds the request (and, from `onModuleInit`, the whole boot)
 * open indefinitely. A hung boot never becomes ready, never gets replaced by the
 * orchestrator, and looks like a deploy that "just didn't come up".
 *
 * `fetchWithTimeout` aborts at the deadline and surfaces a clear error, so the
 * caller's existing fallback path runs instead of hanging.
 */

/** Default deadline for any outbound call. Override per call where needed. */
export function defaultTimeoutMs(): number {
  const raw = Number(process.env.OUTBOUND_HTTP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20_000;
}

export class OutboundTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Outbound request to ${url} timed out after ${ms}ms`);
    this.name = 'OutboundTimeoutError';
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = defaultTimeoutMs(),
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Do not keep the event loop alive just for the deadline.
  timer.unref?.();

  // A caller's own signal must still work — chain it rather than dropping it.
  const callerSignal = init.signal;
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener?.('abort', onCallerAbort, { once: true });

  try {
    // IMPORTANT: `fetch` resolves as soon as the HEADERS arrive. Clearing the
    // timer here would disarm the deadline before the body is read, so a server
    // that returns headers and then dribbles or stalls the body would hang the
    // caller's `res.json()` forever — precisely the failure this exists to
    // prevent. The timer therefore stays armed for the whole budget and is NOT
    // cleared on success: once the body has been consumed, the abort is a
    // harmless no-op on an already-completed request. (The response body must
    // not be touched here — reading or even taking a reader would lock the
    // stream and break every caller's `res.json()`.)
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new OutboundTimeoutError(url, timeoutMs);
    throw e;
  } finally {
    callerSignal?.removeEventListener?.('abort', onCallerAbort);
  }
}

/**
 * Bounds any promise — used for module initialisation that touches the network
 * or the database, so a slow dependency cannot hold the process in "starting"
 * for ever.
 */
export async function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, deadline]);
  } finally {
    clearTimeout(timer!);
  }
}
