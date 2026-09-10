import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';
import { fetchWithTimeout } from '../common/http';

export interface StoredFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

type StorageMode = 'azure-blob' | 's3' | 'gcs' | 'local';

/**
 * Stores the original agreement files, portably across clouds. Provider is
 * GCS_BUCKET explicitly opts into Google Cloud Storage using Application
 * Default Credentials (the attached service account on Cloud Run). Otherwise
 * the existing provider order is preserved:
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
  private gcsBucket = '';
  private gcsToken: { value: string; expiresAt: number } | null = null;
  enabled = false;
  private localDir =
    process.env.STORAGE_LOCAL_DIR ?? path.resolve(process.cwd(), 'data/uploads');

  async onModuleInit(): Promise<void> {
    const prod = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
    if (process.env.GCS_BUCKET) {
      // Never create a bucket or silently switch stores on a configuration error.
      // Infrastructure owns the bucket, retention and access policy.
      const bucket = process.env.GCS_BUCKET;
      try {
        await this.gcsRequest(`/storage/v1/b/${encodeURIComponent(bucket)}`);
      } catch {
        throw new Error('Configured Google Cloud Storage bucket is unavailable; check its name and service-account access');
      }
      this.gcsBucket = bucket;
      this.mode = 'gcs';
      this.enabled = true;
      this.logger.log('Google Cloud Storage ready');
      return;
    }
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
          ? (identityClientId ? new ManagedIdentityCredential(identityClientId) : new ManagedIdentityCredential())
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

  async probe(): Promise<boolean> {
    try {
      if (this.mode === 'gcs' && this.gcsBucket) { await this.gcsRequest(`/storage/v1/b/${encodeURIComponent(this.gcsBucket)}`); return true; }
      if (this.mode === 'azure-blob' && this.container) { await this.container.getProperties(); return true; }
      if (this.mode === 's3' && this.s3) { await this.s3.send(new this.awsMod.HeadBucketCommand({ Bucket: this.bucket })); return true; }
      if (this.mode === 'local') { await fs.mkdir(this.localDir, { recursive: true }); await fs.access(this.localDir); return true; }
      return false;
    } catch { return false; }
  }

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
    if (this.mode === 'gcs' && this.gcsBucket) {
      const query = new URLSearchParams({ uploadType: 'media', name: key, ifGenerationMatch: '0' });
      await this.gcsRequest(`/upload/storage/v1/b/${encodeURIComponent(this.gcsBucket)}/o?${query.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: new Uint8Array(buffer),
      });
    } else if (this.mode === 'azure-blob' && this.container) {
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
    if (this.mode === 'gcs' && this.gcsBucket) {
      const metadata = await this.gcsRequest<{ generation?: string | number; contentType?: string }>(
        `/storage/v1/b/${encodeURIComponent(this.gcsBucket)}/o/${encodeURIComponent(key)}?fields=generation,contentType`,
      );
      if (!metadata.generation) throw new Error('Stored document generation is unavailable');
      // Bind metadata and bytes to one generation, even if an operator replaces
      // an object between the two requests. Downloads still pass through RBAC.
      const download = await this.gcsRequest<ArrayBuffer>(
        `/storage/v1/b/${encodeURIComponent(this.gcsBucket)}/o/${encodeURIComponent(key)}?alt=media&generation=${encodeURIComponent(String(metadata.generation))}`,
        {}, 'arrayBuffer',
      );
      return { buffer: Buffer.from(download), contentType: metadata.contentType ?? 'application/octet-stream', filename };
    }
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

  /**
   * Minimal Google Cloud Storage JSON API client. Keeping this adapter on the
   * platform's built-in fetch avoids another runtime dependency and lets Cloud
   * Run use its attached service account through the metadata server. A token
   * may be supplied explicitly for local/CI smoke tests; it is never logged.
   */
  private async gcsAccessToken(): Promise<string> {
    const configured = process.env.GCS_ACCESS_TOKEN?.trim();
    if (configured) return configured;
    const now = Date.now();
    if (this.gcsToken && this.gcsToken.expiresAt > now + 30_000) return this.gcsToken.value;
    const response = await fetchWithTimeout(
      process.env.GCS_METADATA_TOKEN_URL ?? 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
      5_000,
    );
    if (!response.ok) throw new Error(`Google Cloud token endpoint returned ${response.status}`);
    const body = await response.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('Google Cloud token endpoint returned no access token');
    this.gcsToken = { value: body.access_token, expiresAt: now + Math.max(60, Number(body.expires_in ?? 300)) * 1000 };
    return body.access_token;
  }

  private async gcsRequest<T = unknown>(
    pathname: string,
    init: RequestInit = {},
    responseType: 'json' | 'arrayBuffer' = 'json',
  ): Promise<T> {
    const base = (process.env.GCS_API_BASE ?? 'https://storage.googleapis.com').replace(/\/$/, '');
    const token = await this.gcsAccessToken();
    const response = await fetchWithTimeout(`${base}${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Google Cloud Storage returned ${response.status}: ${detail}`);
    }
    return (responseType === 'arrayBuffer' ? await response.arrayBuffer() : await response.json()) as T;
  }
}
