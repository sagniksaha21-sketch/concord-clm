import { S3Client } from '@aws-sdk/client-s3';
import { StorageService } from '../../src/storage/storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return { ...actual, S3Client: jest.fn() };
});

describe('S3-compatible durable document storage', () => {
  const originalEnv = { ...process.env };
  let send: jest.Mock;

  beforeEach(() => {
    process.env = {
      NODE_ENV: 'staging',
      AWS_S3_BUCKET: 'concord-documents',
      AWS_REGION: 'auto',
      AWS_S3_ENDPOINT: 'https://storage.example.test',
      AWS_S3_FORCE_PATH_STYLE: 'false',
      STORAGE_REQUIRE_DURABLE: 'true',
    };
    send = jest.fn().mockResolvedValue({});
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('supports virtual-hosted buckets and round-trips original document bytes', async () => {
    const objects = new Map<string, { bytes: Buffer; contentType: string }>();
    send.mockImplementation(async (command: any) => {
      const input = command.input;
      if (command.constructor.name === 'PutObjectCommand') {
        objects.set(input.Key, { bytes: Buffer.from(input.Body), contentType: input.ContentType });
      }
      if (command.constructor.name === 'GetObjectCommand') {
        const stored = objects.get(input.Key)!;
        return { Body: { transformToByteArray: async () => stored.bytes }, ContentType: stored.contentType };
      }
      return {};
    });
    const storage = new StorageService();
    await storage.onModuleInit();
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: false }));
    expect(storage.storageMode).toBe('s3');
    const bytes = Buffer.from('original agreement bytes');
    const key = await storage.put(bytes, 'Signed Agreement.pdf', 'application/pdf');
    expect(await storage.get(key)).toEqual({ buffer: bytes, contentType: 'application/pdf', filename: 'Signed_Agreement.pdf' });
    expect(await storage.probe()).toBe(true);
  });

  it('preserves path-style addressing for existing MinIO configurations', async () => {
    delete process.env.AWS_S3_FORCE_PATH_STYLE;
    const storage = new StorageService();
    await storage.onModuleInit();
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: true }));
  });

  it('refuses to fall back to ephemeral disk when the required bucket is unavailable', async () => {
    send.mockRejectedValue(new Error('Access denied'));
    const storage = new StorageService();
    await expect(storage.onModuleInit()).rejects.toThrow('Configured S3 storage is unavailable');
    expect(storage.enabled).toBe(false);
  });

  it('refuses startup if durable storage is required but not configured', async () => {
    delete process.env.AWS_S3_BUCKET;
    await expect(new StorageService().onModuleInit()).rejects.toThrow('Durable object storage is required');
  });

  it('reports lost bucket access as not ready', async () => {
    const storage = new StorageService();
    await storage.onModuleInit();
    send.mockRejectedValue(new Error('Storage offline'));
    expect(await storage.probe()).toBe(false);
  });
});
