import { createServer, Server } from 'http';
import { fetchWithTimeout, withDeadline, OutboundTimeoutError } from '../../src/common/http';

/**
 * Finding C-D30 — Node's `fetch` has no default timeout. Every outbound call
 * (Azure OpenAI, Document Intelligence, Ollama, OpenAI, Melento) was issued
 * without an AbortSignal, so a provider that accepts the connection and then
 * stalls holds the request — and, from `onModuleInit`, the whole boot — open
 * for ever. A process stuck in "starting" never becomes ready and is never
 * replaced by the orchestrator.
 */
describe('Outbound requests have a hard deadline (C-D30)', () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    // A server that accepts the connection and then never responds.
    server = createServer(() => {
      /* deliberately no response */
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as any;
    url = `http://127.0.0.1:${addr.port}/stall`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('aborts a stalled request instead of hanging for ever', async () => {
    const started = Date.now();
    await expect(fetchWithTimeout(url, {}, 300)).rejects.toBeInstanceOf(OutboundTimeoutError);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('names the URL and the budget so the failure is diagnosable', async () => {
    await expect(fetchWithTimeout(url, {}, 200)).rejects.toThrow(/timed out after 200ms/);
  });

  it('bounds module initialisation too', async () => {
    const never = new Promise<void>(() => undefined);
    await expect(withDeadline(never, 150, 'index build')).rejects.toThrow(/index build exceeded 150ms/);
  });

  it('passes a successful response straight through', async () => {
    const ok = createServer((_req, res) => {
      res.statusCode = 200;
      res.end('pong');
    });
    await new Promise<void>((resolve) => ok.listen(0, '127.0.0.1', resolve));
    const port = (ok.address() as any).port;
    try {
      const res = await fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 2000);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('pong');
    } finally {
      await new Promise<void>((resolve) => ok.close(() => resolve()));
    }
  });
});
