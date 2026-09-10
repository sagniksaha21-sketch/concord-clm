import { StorageService } from '../../src/storage/storage.service';
import { degradedModes } from '../../src/security/security.config';

describe('Google Cloud document storage', () => {
  const originalEnv = { ...process.env };
  const bytes = Buffer.from('agreement bytes');
  let fetchMock: jest.Mock;

  const response = (body: unknown, ok = true, status = 200): Response => ({
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
    arrayBuffer: jest.fn().mockResolvedValue(body instanceof ArrayBuffer ? body : Uint8Array.from(Buffer.from(String(body))).buffer),
  } as unknown as Response);

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      GCS_BUCKET: 'concord-documents-uat',
      GCS_ACCESS_TOKEN: 'test-access-token',
      GCS_API_BASE: 'https://storage.test',
    };
    fetchMock = jest.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('alt=media')) return response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (target.includes('/o/') && target.includes('fields=generation')) return response({ generation: '1749001234567890', contentType: 'application/pdf' });
      if (target.includes('/upload/storage/v1/')) return response({ generation: '1749001234567891' });
      if (target.includes('/storage/v1/b/')) return response({ name: 'concord-documents-uat' });
      return response({}, false, 404);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('uses application credentials and verifies the configured bucket before becoming ready', async () => {
    const storage = new StorageService();
    expect(storage.enabled).toBe(false);
    await storage.onModuleInit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://storage.test/storage/v1/b/concord-documents-uat');
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer test-access-token' }));
    expect(storage.enabled).toBe(true);
    expect(storage.storageMode).toBe('gcs');
    expect(storage.s3Location('document')).toBeNull();
    expect(degradedModes().some((mode) => mode.startsWith('storage:'))).toBe(false);
  });

  it('refuses a missing or inaccessible bucket without falling back to local disk', async () => {
    fetchMock.mockImplementation(async () => response('permission denied', false, 403));
    const storage = new StorageService();
    await expect(storage.onModuleInit()).rejects.toThrow('Google Cloud Storage bucket is unavailable');
    expect(storage.enabled).toBe(false);
  });

  it('stores the original bytes and rejects overwriting an existing object', async () => {
    const storage = new StorageService();
    await storage.onModuleInit();
    const key = await storage.put(bytes, 'Mutual NDA.pdf', 'application/pdf');
    expect(key).toMatch(/^[0-9a-f-]{36}-Mutual_NDA\.pdf$/);
    const upload = fetchMock.mock.calls.find(([url]) => String(url).includes('/upload/storage/v1/'));
    expect(upload?.[0]).toContain('uploadType=media');
    expect(upload?.[0]).toContain('ifGenerationMatch=0');
    expect(upload?.[1]?.method).toBe('POST');
    expect(upload?.[1]?.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/pdf', Authorization: 'Bearer test-access-token' }));
    expect(upload?.[1]?.body).toBeInstanceOf(Uint8Array);
    fetchMock.mockImplementation(async (url: string | URL) => String(url).includes('/upload/storage/v1/') ? response('precondition failed', false, 412) : response({ name: 'concord-documents-uat' }));
    await expect(storage.put(bytes, 'agreement.pdf')).rejects.toThrow('precondition failed');
  });

  it('downloads the same generation as the metadata and preserves the file type', async () => {
    const storage = new StorageService();
    await storage.onModuleInit();
    const key = 'b1273a63-21d8-4025-993f-4f7516b5db01-agreement.pdf';
    const result = await storage.get(key);
    const metadata = fetchMock.mock.calls.find(([url]) => String(url).includes('/o/b1273a63-21d8-4025-993f-4f7516b5db01-agreement.pdf'));
    const download = fetchMock.mock.calls.find(([url]) => String(url).includes('alt=media'));
    expect(metadata?.[0]).toContain('fields=generation,contentType');
    expect(download?.[0]).toContain('generation=1749001234567890');
    expect(result).toEqual({ buffer: bytes, filename: 'agreement.pdf', contentType: 'application/pdf' });
  });

  it('fails closed when a generation cannot be identified', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => String(url).includes('/o/') && String(url).includes('fields=generation') ? response({}) : response({ name: 'concord-documents-uat' }));
    const storage = new StorageService();
    await storage.onModuleInit();
    await expect(storage.get('agreement.pdf')).rejects.toThrow('generation is unavailable');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('alt=media'))).toBe(false);
  });

  it.each(['../agreement.pdf', 'folder/agreement.pdf', 'folder\\agreement.pdf'])('rejects unsafe keys before contacting storage: %s', async (key) => {
    const storage = new StorageService();
    await storage.onModuleInit();
    await expect(storage.get(key)).rejects.toThrow('Invalid storage key');
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('reports loss of bucket access through the existing readiness probe', async () => {
    const storage = new StorageService();
    await storage.onModuleInit();
    expect(await storage.probe()).toBe(true);
    fetchMock.mockImplementation(async () => response('unavailable', false, 503));
    expect(await storage.probe()).toBe(false);
  });

  it('preserves the development local-storage default when GCS is not selected', async () => {
    process.env = { NODE_ENV: 'test' };
    const storage = new StorageService();
    await storage.onModuleInit();
    expect(storage.storageMode).toBe('local');
    expect(storage.enabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
