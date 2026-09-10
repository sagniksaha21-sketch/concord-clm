import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { fetchWithTimeout } from '../common/http';
import { embedWithGemini, EmbeddingTask } from '../common/gcp-ai';

export type EmbeddingsProvider = 'local' | 'ollama' | 'azure' | 'openai' | 'bedrock' | 'gcp';

/**
 * Turns text into vectors for semantic search. The provider is chosen by env,
 * so the same code runs at **zero AI cost** or against a managed model:
 *
 *   EMBEDDINGS_PROVIDER=local   (default) deterministic, in-process, offline, FREE.
 *                               A lexical hashing embedder — good for demos and
 *                               ranking; no external call, no GPU, no bill.
 *   EMBEDDINGS_PROVIDER=ollama  real semantic vectors from a LOCAL Ollama server
 *                               (e.g. `nomic-embed-text`) — free, self-hosted.
 *   EMBEDDINGS_PROVIDER=openai  OpenAI `text-embedding-3-*` (managed, paid).
 *   EMBEDDINGS_PROVIDER=azure   Azure OpenAI embeddings deployment (managed, paid).
 *   EMBEDDINGS_PROVIDER=gcp     Gemini embeddings through Google Cloud (managed, paid).
 *
 * Every provider emits vectors of EMBEDDINGS_DIM (default 768) so the pgvector
 * column and index stay stable when you switch providers (re-index after a swap).
 * GCP failures never substitute hash vectors into a semantic index. Other
 * providers retain their existing fallback behavior.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  readonly provider = (process.env.EMBEDDINGS_PROVIDER as EmbeddingsProvider) || 'local';
  readonly dim = Number(process.env.EMBEDDINGS_DIM || 768);
  readonly model = this.resolveModel();

  private resolveModel(): string {
    switch (this.provider) {
      case 'ollama':
        return process.env.EMBEDDINGS_MODEL || 'nomic-embed-text';
      case 'openai':
        return process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';
      case 'azure':
        return process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT || 'text-embedding-3-small';
      case 'bedrock':
        return process.env.BEDROCK_EMBEDDINGS_MODEL || 'amazon.titan-embed-text-v2:0';
      case 'gcp':
        return process.env.GCP_EMBEDDINGS_MODEL || 'gemini-embedding-001';
      default:
        return 'local-hash-v1';
    }
  }

  /** One vector for one string. */
  async embed(text: string): Promise<number[]> {
    const [v] = await this.embedBatch([text], 'RETRIEVAL_QUERY');
    return v;
  }

  /** Vectors for many strings (one round-trip where the provider supports it). */
  async embedBatch(texts: string[], task: EmbeddingTask = 'RETRIEVAL_DOCUMENT'): Promise<number[][]> {
    if (!texts.length) return [];
    try {
      switch (this.provider) {
        case 'ollama':
          return await this.embedOllama(texts);
        case 'openai':
          return await this.embedOpenAI(texts);
        case 'azure':
          return await this.embedAzure(texts);
        case 'bedrock':
          return await this.embedBedrock(texts);
        case 'gcp':
          return await this.embedGcp(texts, task);
        default:
          return texts.map((t) => this.embedLocal(t));
      }
    } catch (err) {
      if (this.provider === 'gcp') {
        this.logger.warn('Google embeddings unavailable; no replacement vectors were written');
        throw new ServiceUnavailableException('Semantic search is temporarily unavailable. Use the repository search field or try again.');
      }
      this.logger.warn(
        `Embeddings provider "${this.provider}" failed (${String(err)}) — falling back to local`,
      );
      return texts.map((t) => this.embedLocal(t));
    }
  }

  cost(): 'free' | 'paid' {
    return this.provider === 'openai' || this.provider === 'azure' || this.provider === 'bedrock' || this.provider === 'gcp'
      ? 'paid'
      : 'free';
  }

  // ─── local: deterministic, offline, free ───────────────────────────────────
  /**
   * A hashed bag-of-words embedding. Tokenises, hashes each token (with its
   * bigram) into the vector space, weights by sub-linear term frequency, then
   * L2-normalises. Not a neural model — but stable, dependency-free and good
   * enough to rank passages by lexical overlap. Point EMBEDDINGS_PROVIDER at
   * Ollama for true semantic quality at no API cost.
   */
  private embedLocal(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0);
    const tokens = (text.toLowerCase().match(/[a-z0-9]+/g) || [])
      .filter((t) => t.length > 1)
      .map((t) => this.stem(t));
    const tf = new Map<string, number>();
    const bump = (term: string) => tf.set(term, (tf.get(term) || 0) + 1);
    for (let i = 0; i < tokens.length; i++) {
      bump(tokens[i]);
      if (i > 0) bump(`${tokens[i - 1]}_${tokens[i]}`); // bigram
    }
    for (const [term, count] of tf) {
      const idx = this.hash(term) % this.dim;
      const sign = (this.hash(term + '#') & 1) === 0 ? 1 : -1;
      v[idx] += sign * (1 + Math.log(count));
    }
    return this.l2normalize(v);
  }

  /** Crude suffix stemmer so renewal/renewals/renew and the like collide. */
  private stem(t: string): string {
    for (const suf of ['ations', 'ation', 'ings', 'ing', 'als', 'ment', 'ions', 'ion', 'ed', 'es', 'al', 's']) {
      if (t.length > suf.length + 2 && t.endsWith(suf)) return t.slice(0, -suf.length);
    }
    return t;
  }

  private hash(s: string): number {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // ─── ollama: real vectors, local, free ──────────────────────────────────────
  private async embedOllama(texts: string[]): Promise<number[][]> {
    const base = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    const out: number[][] = [];
    for (const prompt of texts) {
      const res = await fetchWithTimeout(`${base}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data: any = await res.json();
      out.push(this.fit(data.embedding as number[]));
    }
    return out;
  }

  // ─── openai: managed, paid ──────────────────────────────────────────────────
  private async embedOpenAI(texts: string[]): Promise<number[][]> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set');
    const res = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: this.dim }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data: any = await res.json();
    return data.data.map((d: any) => this.fit(d.embedding as number[]));
  }

  // ─── azure openai: managed, paid ────────────────────────────────────────────
  private async embedAzure(texts: string[]): Promise<number[][]> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
    const key = process.env.AZURE_OPENAI_API_KEY;
    if (!endpoint || !key) throw new Error('AZURE_OPENAI_* not set');
    const version = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    const url = `${endpoint}/openai/deployments/${this.model}/embeddings?api-version=${version}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({ input: texts, dimensions: this.dim }),
    });
    if (!res.ok) throw new Error(`Azure OpenAI ${res.status}`);
    const data: any = await res.json();
    return data.data.map((d: any) => this.fit(d.embedding as number[]));
  }

  // ─── amazon bedrock: managed, paid, no GPU to run ───────────────────────────
  private bedrockClient: any = null;
  private bedrockMod: any = null;
  private getBedrock(): { client: any; mod: any } {
    if (!this.bedrockClient) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      this.bedrockMod = require('@aws-sdk/client-bedrock-runtime');
      const cfg: any = {
        region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1',
      };
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        cfg.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        };
      }
      this.bedrockClient = new this.bedrockMod.BedrockRuntimeClient(cfg);
    }
    return { client: this.bedrockClient, mod: this.bedrockMod };
  }

  private async embedBedrock(texts: string[]): Promise<number[][]> {
    const { client, mod } = this.getBedrock();
    // Titan v2 supports 256/512/1024; request the configured dim when supported,
    // else let it default and fit() to EMBEDDINGS_DIM.
    const dims = [256, 512, 1024].includes(this.dim) ? this.dim : undefined;
    const out: number[][] = [];
    for (const inputText of texts) {
      const body: any = { inputText, normalize: true };
      if (dims) body.dimensions = dims;
      const res = await client.send(
        new mod.InvokeModelCommand({
          modelId: this.model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(body),
        }),
      );
      const payload = JSON.parse(new TextDecoder().decode(res.body));
      out.push(this.fit(payload.embedding as number[]));
    }
    return out;
  }

  // ─── Google Cloud Gemini embeddings: managed, paid ────────────────────────
  private async embedGcp(texts: string[], task: EmbeddingTask): Promise<number[][]> {
    const result = await embedWithGemini(texts, this.dim, task);
    return result.vectors.map((vector) => this.fit(vector));
  }

  /** Isolates Google model/dimension changes during re-indexing and rolling releases. */
  get indexProvider(): string {
    return this.provider === 'gcp' ? `gcp:${this.model}:${this.dim}:retrieval-v1` : this.provider;
  }

  // ─── helpers ────────────────────────────────────────────────────────────────
  /** Pad/truncate a provider vector to EMBEDDINGS_DIM and re-normalise. */
  private fit(vec: number[]): number[] {
    if (vec.length === this.dim) return this.l2normalize(vec.slice());
    const v = new Array<number>(this.dim).fill(0);
    for (let i = 0; i < Math.min(vec.length, this.dim); i++) v[i] = vec[i];
    return this.l2normalize(v);
  }

  private l2normalize(v: number[]): number[] {
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return v.map((x) => x / norm);
  }

  /** Cosine similarity of two L2-normalised vectors (= dot product). */
  static cosine(a: number[], b: number[]): number {
    let dot = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) dot += a[i] * b[i];
    return dot;
  }
}
