import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';

export interface StoredFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

type StorageMode = 'azure-blob' | 's3' | 'local';

/**
 * Stores the original agreement files, portably across clouds. Provider is
 * chosen by env, in order:
 *   1. Azure Blob   — managed identity (AZURE_STORAGE_ACCOUNT_URL) or connection string
 *   2. Amazon S3     — AWS_S3_BUCKET set (or any S3-compatible via AWS_S3_ENDPOINT)
 *   3. Local disk    — dev fallback (STORAGE_LOCAL_DIR)
 * so upload and download work identically in dev and on either cloud. The AWS
 * SDK is loaded dynamically, so the build never hard-depends on it.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private mode: StorageMode = 'local';
  private container: ContainerClient | null = null;
  private s3: any = null;
  private awsMod: any = null;
  private bucket = '';
  enabled = false;
  private localDir =
    process.env.STORAGE_LOCAL_DIR ?? path.resolve(process.cwd(), 'data/uploads');

  async onModuleInit(): Promise<void> {
    const prod = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL;
    if (conn || accountUrl) {
      const containerName = process.env.AZURE_STORAGE_CONTAINER ?? 'documents';
      try {
        // Managed identity is preferred in Azure so a long-lived storage account
        // key never has to exist in the Container App environment. Connection
        // strings remain supported for non-Azure deployments and local testing.
        const identityClientId = process.env.AZURE_STORAGE_MANAGED_IDENTITY_CLIENT_ID;
        const credential = process.env.NODE_ENV === 'production'
          ? new ManagedIdentityCredential(identityClientId || undefined)
          : new DefaultAzureCredential({ managedIdentityClientId: identityClientId });
        const svc = conn
          ? BlobServiceClient.fromConnectionString(conn)
          : new BlobServiceClient(accountUrl!, credential);
        this.container = svc.getContainerClient(containerName);
        if (prod) {
          // Infrastructure owns container creation. Production startup only
          // verifies access, so a typo cannot create a new empty system of record.
          await this.container.getProperties();
        } else {
          await this.container.createIfNotExists();
        }
        this.mode = 'azure-blob';
        this.enabled = true;
        this.logger.log(`Azure Blob storage ready (container: ${containerName})`);
        return;
      } catch (e) {
        this.container = null;
        if (prod) throw new Error(`Azure Blob unavailable in production: ${String(e)}`);
        this.logger.warn(`Blob unavailable (${String(e)}) — trying next provider`);
      }
    }

    if (process.env.AWS_S3_BUCKET) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        this.awsMod = require('@aws-sdk/client-s3');
        this.bucket = process.env.AWS_S3_BUCKET;
        const cfg: any = { region: process.env.AWS_REGION || 'us-east-1' };
        if (process.env.AWS_S3_ENDPOINT) {
          cfg.endpoint = process.env.AWS_S3_ENDPOINT;
          cfg.forcePathStyle = true; // MinIO / S3-compatible
        }
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
          cfg.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          };
        }
        this.s3 = new this.awsMod.S3Client(cfg);
        // Constructing an SDK client proves nothing about credentials, DNS or
        // bucket policy. Probe the bucket before advertising storage as ready.
        await this.s3.send(new this.awsMod.HeadBucketCommand({ Bucket: this.bucket }));
        this.mode = 's3';
        this.enabled = true;
        this.logger.log(`Amazon S3 storage ready (bucket: ${this.bucket})`);
        return;
      } catch (e) {
        if (prod) throw new Error(`S3 unavailable in production: ${String(e)}`);
        this.logger.warn(`S3 unavailable (${String(e)}) — using local disk`);
      }
    }

    if (prod) throw new Error('Durable object storage is required in production');
    this.logger.log(`Using local disk storage at ${this.localDir} (development only)`);
  }

  /** The active storage backend. */
  get storageMode(): StorageMode {
    return this.mode;
  }

  async probe(): Promise<boolean> { try { if(this.mode==='azure-blob'&&this.container){ await this.container.getProperties(); return true;} if(this.mode==='s3'&&this.s3){ await this.s3.send(new this.awsMod.HeadBucketCommand({Bucket:this.bucket})); return true;} if(this.mode==='local'){ await fs.mkdir(this.localDir,{recursive:true}); await fs.access(this.localDir); return true;} return false;} catch { return false;} }

  /** S3 object ref for a key when S3 is the backend (for Textract async OCR). */
  s3Location(key: string): { Bucket: string; Name: string } | null {
    return this.mode === 's3' ? { Bucket: this.bucket, Name: key } : null;
  }

  private safeName(name: string): string {
    return name.replace(/[^\w.\-]+/g, '_');
  }
  private assertKey(key: string): void {
    if (/[\\/]|\.\./.test(key)) throw new Error('Invalid storage key');
  }

  /** Stores bytes and returns the storage key used for retrieval. */
  async put(
    buffer: Buffer,
    filename: string,
    contentType = 'application/octet-stream',
  ): Promise<string> {
    const key = `${randomUUID()}-${this.safeName(filename)}`;
    if (this.mode === 'azure-blob' && this.container) {
      const blob = this.container.getBlockBlobClient(key);
      await blob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
    } else if (this.mode === 's3' && this.s3) {
      await this.s3.send(
        new this.awsMod.PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } else {
      await fs.mkdir(this.localDir, { recursive: true });
      await fs.writeFile(path.join(this.localDir, key), buffer);
    }
    return key;
  }

  async get(key: string): Promise<StoredFile> {
    this.assertKey(key);
    const filename = key.replace(/^[0-9a-f-]{36}-/i, '');
    if (this.mode === 'azure-blob' && this.container) {
      const blob = this.container.getBlockBlobClient(key);
      const buffer = await blob.downloadToBuffer();
      const props = await blob.getProperties();
      return {
        buffer,
        contentType: props.contentType ?? 'application/octet-stream',
        filename,
      };
    }
    if (this.mode === 's3' && this.s3) {
      const res = await this.s3.send(
        new this.awsMod.GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: res.ContentType ?? 'application/octet-stream',
        filename,
      };
    }
    const buffer = await fs.readFile(path.join(this.localDir, key));
    return { buffer, contentType: 'application/octet-stream', filename };
  }
}
