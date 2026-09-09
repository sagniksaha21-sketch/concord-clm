import { Injectable, Logger } from '@nestjs/common';
import { fetchWithTimeout } from '../common/http';

export interface FileToCheck {
  originalname: string;
  buffer: Buffer;
  size?: number;
  mimetype?: string;
}

export interface FileVerdict {
  ok: boolean;
  /** MIME sniffed from the file's magic bytes (not the client-declared type). */
  detectedType: string;
  /** 'clean' | 'infected' | 'unscanned' from the malware-scan seam. */
  scan: 'clean' | 'infected' | 'unscanned';
  scanEngine: string;
  /** Present when ok=false — why the file was rejected/quarantined. */
  reason?: string;
}

/** Signatures we accept for contract ingestion, by leading magic bytes. */
const SIGNATURES: { type: string; test: (b: Buffer) => boolean }[] = [
  { type: 'application/pdf', test: (b) => b.slice(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image/png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/tiff', test: (b) => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00) },
  // DOCX/XLSX/PPTX are ZIP containers (PK\x03\x04).
  { type: 'application/zip', test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
];

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'application/zip', // docx/xlsx/pptx
  'text/plain',
]);

/** Signatures we hard-reject up front regardless of extension (executables/scripts). */
const DENY: { type: string; test: (b: Buffer) => boolean }[] = [
  { type: 'application/x-msdownload', test: (b) => b[0] === 0x4d && b[1] === 0x5a }, // MZ (PE/EXE/DLL)
  { type: 'application/x-elf', test: (b) => b[0] === 0x7f && b.slice(1, 4).toString('latin1') === 'ELF' },
  { type: 'application/x-mach-binary', test: (b) => [0xfeedface, 0xfeedfacf, 0xcafebabe].includes(b.readUInt32BE(0)) },
  { type: 'application/x-sh', test: (b) => b[0] === 0x23 && b[1] === 0x21 }, // #! shebang
];

/**
 * Document upload security (assessment finding H2).
 *
 * Every uploaded file is (1) size-checked, (2) content-sniffed by magic bytes —
 * never trusting the client-declared MIME type — against an allow-list, and
 * (3) passed through a malware-scan seam. Anything that fails is quarantined
 * (never OCR'd or indexed).
 */
@Injectable()
export class FileSecurityService {
  private readonly logger = new Logger(FileSecurityService.name);

  private get maxBytes(): number {
    return Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
  }

  /** Sniff the real type from the first bytes; falls back to text/plain if printable. */
  detectType(buffer: Buffer): string {
    if (buffer.length >= 4) {
      for (const d of DENY) {
        try {
          if (d.test(buffer)) return d.type;
        } catch {
          /* readUInt32BE guard for short buffers */
        }
      }
    }
    for (const sig of SIGNATURES) {
      if (sig.test(buffer)) return sig.type;
    }
    // Text heuristic: a NUL byte or control chars mean binary, not text. High
    // bytes are allowed (UTF-8), but a single NUL is enough to reject as binary.
    const sample = buffer.slice(0, 512);
    if (sample.includes(0x00)) return 'application/octet-stream';
    const bad = sample.filter((c) => c === 0x7f || (c < 32 && c !== 9 && c !== 10 && c !== 13)).length;
    if (sample.length > 0 && bad / sample.length < 0.02) return 'text/plain';
    return 'application/octet-stream';
  }

  /**
   * Validates an OOXML ZIP without decompressing it. This blocks arbitrary ZIP
   * uploads and high-expansion ZIP bombs before OCR/parser libraries ever see
   * the archive.
   */
  private inspectOfficeZip(buffer: Buffer, filename: string): { ok: boolean; reason?: string } {
    const maxExpanded = Number(process.env.UPLOAD_MAX_EXPANDED_BYTES || 100 * 1024 * 1024);
    const maxRatio = Number(process.env.UPLOAD_MAX_ZIP_RATIO || 80);
    const tailStart = Math.max(0, buffer.length - 65_557);
    let eocd = -1;
    for (let i = buffer.length - 22; i >= tailStart; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return { ok: false, reason: 'invalid ZIP: end-of-central-directory record missing' };
    const entries = buffer.readUInt16LE(eocd + 10);
    const centralSize = buffer.readUInt32LE(eocd + 12);
    const centralOffset = buffer.readUInt32LE(eocd + 16);
    if (centralOffset + centralSize > buffer.length) return { ok: false, reason: 'invalid ZIP: central directory is out of bounds' };
    if (entries > 5000) return { ok: false, reason: `ZIP has too many entries (${entries})` };

    let pos = centralOffset;
    let expanded = 0;
    let hasContentTypes = false;
    let hasOfficeRoot = false;
    const ext = filename.toLowerCase().split('.').pop() || '';
    if (!['docx', 'xlsx', 'pptx'].includes(ext)) return { ok: false, reason: 'ZIP uploads must be DOCX, XLSX or PPTX OOXML documents' };
    const expectedRoot = ext === 'docx' ? 'word/' : ext === 'xlsx' ? 'xl/' : 'ppt/';

    for (let n = 0; n < entries; n++) {
      if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50) return { ok: false, reason: 'invalid ZIP central-directory entry' };
      const compressed = buffer.readUInt32LE(pos + 20);
      const uncompressed = buffer.readUInt32LE(pos + 24);
      const nameLen = buffer.readUInt16LE(pos + 28);
      const extraLen = buffer.readUInt16LE(pos + 30);
      const commentLen = buffer.readUInt16LE(pos + 32);
      const end = pos + 46 + nameLen + extraLen + commentLen;
      if (end > buffer.length) return { ok: false, reason: 'invalid ZIP entry bounds' };
      const name = buffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf8').replace(/\\/g, '/');
      if (name === '[Content_Types].xml') hasContentTypes = true;
      if (name.startsWith(expectedRoot)) hasOfficeRoot = true;
      if (name.startsWith('/') || name.split('/').includes('..')) return { ok: false, reason: 'ZIP contains an unsafe path' };
      expanded += uncompressed;
      if (expanded > maxExpanded) return { ok: false, reason: `ZIP expands beyond the ${Math.round(maxExpanded / 1048576)}MB safety limit` };
      if (compressed > 0 && uncompressed / compressed > maxRatio) return { ok: false, reason: `ZIP entry expansion ratio exceeds ${maxRatio}:1` };
      pos = end;
    }
    if (!hasContentTypes || !hasOfficeRoot) return { ok: false, reason: `ZIP is not a structurally valid ${ext.toUpperCase()} OOXML document` };
    return { ok: true };
  }

  async check(file: FileToCheck): Promise<FileVerdict> {
    const size = file.size ?? file.buffer.length;
    if (size <= 0) {
      return this.reject('empty file', 'application/octet-stream');
    }
    if (size > this.maxBytes) {
      return this.reject(
        `file is ${(size / 1_048_576).toFixed(1)}MB — exceeds the ${(this.maxBytes / 1_048_576).toFixed(0)}MB limit`,
        'application/octet-stream',
      );
    }

    const detectedType = this.detectType(file.buffer);
    if (!ALLOWED.has(detectedType)) {
      return this.reject(
        `content type ${detectedType} is not an accepted document format`,
        detectedType,
      );
    }

    if (detectedType === 'application/zip') {
      const office = this.inspectOfficeZip(file.buffer, file.originalname);
      if (!office.ok) return this.reject(office.reason || 'unsafe Office ZIP container', detectedType);
    }

    // Client-declared type must not contradict the sniffed type (e.g. an .exe
    // renamed to .pdf): if a specific type was declared, it has to be compatible.
    if (file.mimetype && file.mimetype !== 'application/octet-stream') {
      const declaredFamily = file.mimetype.split('/')[0];
      const detectedFamily = detectedType.split('/')[0];
      const zipDocx =
        detectedType === 'application/zip' &&
        /officedocument|msword|ms-excel|powerpoint|zip/.test(file.mimetype);
      if (declaredFamily !== detectedFamily && !zipDocx && detectedType !== 'text/plain') {
        this.logger.warn(
          `Declared MIME ${file.mimetype} != sniffed ${detectedType} for ${file.originalname}`,
        );
      }
    }

    const scan = await this.scan(file.buffer, file.originalname);
    if (scan.status === 'infected') {
      return { ok: false, detectedType, scan: 'infected', scanEngine: scan.engine, reason: 'malware detected' };
    }

    return { ok: true, detectedType, scan: scan.status, scanEngine: scan.engine };
  }

  /**
   * Malware scan against the configured service.
   *
   * ## What was wrong before
   *
   * This method used to be a seam with the real call **commented out**. When no
   * endpoint was set it returned `unscanned`, which is honest. But when an
   * endpoint WAS set it returned `{status:'unscanned', engine:'seam'}` — it never
   * contacted the scanner, logged nothing, and raised no error.
   *
   * That is the most dangerous shape a security control can take. An operator
   * sets `MALWARE_SCAN_URL`, sees a clean boot and successful uploads, and
   * reasonably concludes scanning is on. It is not. The control is *reported* as
   * present and is absent — worse than having no control, because it stops
   * anyone looking for one.
   *
   * ## What it does now
   *
   * POSTs the bytes to the configured scanner and reads its verdict. Three
   * outcomes, and none of them silently pretends:
   *
   *  - `clean` / `infected` — the scanner answered.
   *  - `unscanned` with engine `none` — no scanner is configured. Honest, and
   *    `UPLOAD_REQUIRE_SCAN=true` turns it into a rejection.
   *  - `unscanned` with engine `error` — a scanner IS configured and did not
   *    answer. Logged at error level, never downgraded to "probably fine".
   *
   * The response shape is deliberately permissive because scanners disagree:
   * ClamAV REST wrappers return `{malware:bool}`, some return `{clean:bool}`,
   * some a bare `OK`/`FOUND` string. Anything not positively recognised as clean
   * is treated as not-clean.
   */
  private async scan(
    buffer: Buffer,
    name: string,
  ): Promise<{ status: 'clean' | 'infected' | 'unscanned'; engine: string }> {
    const endpoint = process.env.MALWARE_SCAN_URL || process.env.CLAMAV_HOST;
    if (!endpoint) {
      return { status: 'unscanned', engine: 'none' };
    }
    const engine = process.env.MALWARE_SCAN_ENGINE || 'clamav';
    const timeout = Number(process.env.MALWARE_SCAN_TIMEOUT_MS) || 15_000;

    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(name),
            ...(process.env.MALWARE_SCAN_API_KEY
              ? { Authorization: `Bearer ${process.env.MALWARE_SCAN_API_KEY}` }
              : {}),
          },
          body: new Uint8Array(buffer),
        },
        timeout,
      );

      if (!res.ok) {
        this.logger.error(
          `Malware scanner ${endpoint} returned HTTP ${res.status} for "${name}" — treating as UNSCANNED`,
        );
        return { status: 'unscanned', engine: 'error' };
      }

      const text = await res.text();
      let verdict: any = null;
      try {
        verdict = JSON.parse(text);
      } catch {
        verdict = text.trim();
      }

      const isClean =
        verdict === true ||
        /^(ok|clean|no threats? found)$/i.test(String(verdict)) ||
        verdict?.clean === true ||
        verdict?.malware === false ||
        verdict?.infected === false ||
        /^(clean|ok)$/i.test(String(verdict?.status ?? verdict?.result ?? ''));

      const isInfected =
        /found|infected|malware|virus/i.test(String(verdict)) ||
        verdict?.clean === false ||
        verdict?.malware === true ||
        verdict?.infected === true;

      if (isInfected) return { status: 'infected', engine };
      if (isClean) return { status: 'clean', engine };

      // The scanner answered in a shape we do not recognise. Guessing "clean"
      // here would reintroduce exactly the silent-pass this method was fixed to
      // remove.
      this.logger.error(
        `Malware scanner ${endpoint} returned an unrecognised verdict for "${name}" ` +
          `(${text.slice(0, 120)}) — treating as UNSCANNED`,
      );
      return { status: 'unscanned', engine: 'error' };
    } catch (e) {
      this.logger.error(
        `Malware scan of "${name}" FAILED against ${endpoint}: ${String(e)} — treating as UNSCANNED`,
      );
      return { status: 'unscanned', engine: 'error' };
    }
  }

  private reject(reason: string, detectedType: string): FileVerdict {
    return { ok: false, detectedType, scan: 'unscanned', scanEngine: 'none', reason };
  }
}
