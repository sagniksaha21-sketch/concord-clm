import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Free, offline OCR — the zero-cost path, no cloud call. Uses standard
 * open-source binaries (install once on the box):
 *   apt-get install -y poppler-utils tesseract-ocr
 *
 *  - Born-digital PDFs (the common contract case): `pdftotext` reads the text
 *    layer directly — instant, exact, no OCR.
 *  - Scanned PDFs: `pdftoppm` rasterises each page to PNG, then `tesseract`
 *    OCRs them.
 *  - Images (PNG/JPG/TIFF): `tesseract` directly.
 *
 * Everything runs locally, so the whole ingestion path can be zero-AI-cost.
 * TESSERACT_LANG (default `eng`) selects the language pack.
 */

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString());
    });
  });
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'gif', 'webp'];

export async function ocrWithTesseract(buffer: Buffer, filename: string): Promise<string> {
  const ext = (filename.split('.').pop() ?? '').toLowerCase();
  const lang = process.env.TESSERACT_LANG || 'eng';
  if (!/^[A-Za-z0-9_.+-]{1,64}$/.test(lang)) throw new Error('Invalid TESSERACT_LANG');

  if (/\.(txt|md|json|csv)$/i.test(filename)) return buffer.toString('utf8');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'concord-ocr-'));
  try {
    const inPath = path.join(dir, `in.${ext || 'bin'}`);
    await fs.writeFile(inPath, buffer);

    if (ext === 'pdf') {
      // 1) Born-digital: pull the embedded text layer (free, exact, instant).
      try {
        const layer = (await run('pdftotext', ['-layout', inPath, '-'])).trim();
        if (layer.length >= 20) return layer;
      } catch {
        /* fall through to OCR */
      }
      // 2) Scanned: rasterise pages then OCR each.
      await run('pdftoppm', ['-png', '-r', '300', inPath, path.join(dir, 'page')]);
      const pages = (await fs.readdir(dir))
        .filter((f) => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      if (!pages.length) throw new Error('pdftoppm produced no pages');
      let text = '';
      for (const p of pages) {
        text += (await run('tesseract', [path.join(dir, p), 'stdout', '-l', lang])) + '\n';
      }
      return text.trim();
    }

    if (IMAGE_EXT.includes(ext)) {
      return (await run('tesseract', [inPath, 'stdout', '-l', lang])).trim();
    }

    throw new Error(`Tesseract: unsupported file type .${ext}`);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
