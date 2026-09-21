import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { DraftSection } from '@concord/shared';
import { crc32 } from '../reports/zip';

const MAX_XML = 4 * 1024 * 1024;
const fail = (message: string): never => { throw new BadRequestException(message); };

/** Read a bounded OOXML part in memory; never extract paths or follow relationships. */
export function readWordPackage(bytes: Buffer): { name: string; data: Buffer }[] {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) return fail('Use a standard, unencrypted Word document.');
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), central = bytes.readUInt32LE(end + 16);
  if (count > 5000 || count !== bytes.readUInt16LE(end + 8) || central + centralSize !== end) return fail('The Word file has an invalid archive directory.');
  let pos = central, total = 0; const entries: { name: string; data: Buffer }[] = [];
  const names = new Set<string>();
  for (let n = 0; n < count; n++) {
    if (pos + 46 > end || bytes.readUInt32LE(pos) !== 0x02014b50) return fail('The Word file is incomplete.');
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10), compressed = bytes.readUInt32LE(pos + 20), expanded = bytes.readUInt32LE(pos + 24);
    const nameLen = bytes.readUInt16LE(pos + 28), next = pos + 46 + nameLen + bytes.readUInt16LE(pos + 30) + bytes.readUInt16LE(pos + 32);
    if (next > end) return fail('The Word file is incomplete.');
    const name = bytes.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    if (names.has(name) || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..') || flags & 1) return fail('The Word file contains an unsafe or encrypted entry.');
    names.add(name);
    if (/vbaProject|embeddings\//i.test(name)) return fail('Embedded programs and objects cannot be opened in the editor.');
    {
      let result: Buffer;
      const limit = /\.xml$|\.rels$/i.test(name) ? MAX_XML : 25*1024*1024;
      total += expanded;
      if (total > 50*1024*1024) return fail('The Word package exceeds safe import limits.');
      const local = bytes.readUInt32LE(pos + 42);
      if (expanded > limit || ![0,8].includes(method) || local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== flags) return fail('The document exceeds the editor’s safe import limits.');
      const localNameLen = bytes.readUInt16LE(local + 26), start = local + 30 + localNameLen + bytes.readUInt16LE(local + 28);
      if (start + compressed > central || bytes.subarray(local + 30, local + 30 + localNameLen).toString('utf8') !== name) return fail('The Word file contains an invalid document entry.');
      try { result = method === 0 ? bytes.subarray(start, start + compressed) : inflateRawSync(bytes.subarray(start, start + compressed), { maxOutputLength: limit }); } catch { return fail('The Word document could not be decompressed safely.'); }
      if (result.length !== expanded || crc32(result) !== bytes.readUInt32LE(pos + 16)) return fail('The document failed its integrity check.');
      if (/\.xml$|\.rels$/i.test(name) && /<!DOCTYPE|<!ENTITY/i.test(result.toString('utf8'))) return fail('Unsafe referenced content in the Word package.');
      entries.push({ name, data: result });
    }
    pos = next;
  }
  if (pos !== end || !names.has('word/document.xml') || !names.has('[Content_Types].xml')) return fail('A Word document was not found in this file.');
  return entries;
}

export function readEditableDocument(bytes: Buffer, filename: string): { sections: DraftSection[]; original: DraftSection[]; trackedChanges: boolean; notice: string; preserveFormatting?: boolean; lockedSections?: string[] } {
  if (filename.toLowerCase().endsWith('.txt')) {
    const text = bytes.toString('utf8');
    if (bytes.length > 1000000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(text)) return fail('Use a UTF-8 text document of at most 1 MB.');
    const sections = text.split(/\n\s*\n/).filter(p => p.trim()).map((body,i) => ({ id: `paragraph-${i}`, kind: 'paragraph' as const, heading: `Paragraph ${i + 1}`, body: body.trim() }));
    if (!sections.length || sections.length > 100 || sections.some(s => s.body.length > 50000)) return fail('This document is too large for clause editing. Use document exchange.');
    return { sections, original: sections, trackedChanges: false, notice: 'Saving creates a new Word version. The uploaded text remains preserved.' };
  }
  if (!filename.toLowerCase().endsWith('.docx')) return fail('Direct editing supports Word (.docx) and UTF-8 text. Keep this file in Versions and upload a Word copy to edit.');
  const xml = readWordPackage(bytes).find(e => e.name === 'word/document.xml')!.data.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /<\w*:?((?:object|altChunk))\b/.test(xml)) return fail('Unsupported referenced content. Continue editing it in Word, then upload the revised file.');
  if (!xml.includes('xmlns:w=') || [...xml.matchAll(/<w:(?:trPr|pPr)\b[^>]*>[\s\S]*?<\/w:(?:trPr|pPr)>/g)].some(m => /<w:(?:ins|del)\b/.test(m[0]))) return fail('Structural tracked changes need Word review. Accept or reject row and paragraph-mark changes in Word before opening the editor.');
  if (XMLValidator.validate(xml) !== true) return fail('The Word document contains malformed XML.');
  // Bound nesting before the parser sees it. No custom entities or external entities are accepted.
  let depth = 0, nodes = 0;
  for (const m of xml.matchAll(/<([^>]+)>/g)) {
    const tag = m[1]; if (/^[!?]/.test(tag)) continue;
    depth += tag.startsWith('/') ? -1 : tag.endsWith('/') ? 0 : 1;
    if (depth > 80 || ++nodes > 100000) return fail('The Word document is too complex for safe clause editing.');
  }
  const tree = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: false, processEntities: true }).parse(xml);
  const paragraphs: { before: string; after: string }[] = [];
  let trackedChanges = false;
  function language(nodes: any[], mode: 'before' | 'after'): string {
    let text = '';
    for (const node of nodes ?? []) for (const [tag, children] of Object.entries(node)) {
      if (tag === 'ins' || tag === 'del' || tag === 'moveFrom' || tag === 'moveTo') {
        trackedChanges = true;
        if ((mode === 'before' && ['del','moveFrom'].includes(tag)) || (mode === 'after' && ['ins','moveTo'].includes(tag))) text += language(children as any[], mode);
      } else if (tag === 't' || tag === 'delText') text += (children as any[]).map(n => n['#text'] ?? '').join('');
      else if (tag === 'tab') text += '\t';
      else if (tag === 'br' || tag === 'cr') text += '\n';
      else if (Array.isArray(children) && !['pPr','rPr'].includes(tag)) text += language(children, mode);
    }
    return text;
  }
  function visit(nodes: any[]) {
    for (const node of nodes) for (const [tag, children] of Object.entries(node)) {
      if (tag === 'p') paragraphs.push({ before: language(children as any[], 'before'), after: language(children as any[], 'after') });
      else if (Array.isArray(children)) visit(children);
    }
  }
  visit(tree);
  const rows = paragraphs.filter(p => p.before.trim() || p.after.trim());
  if (!rows.length) return fail('No editable text was found. Continue editing it in Word, then upload the revised file.');
  if (rows.length > 100 || rows.some(p => Math.max(p.before.length, p.after.length) > 50000)) return fail('This document is too large for clause editing. Continue with Word document exchange.');
  const toSections = (key: 'before' | 'after') => rows.map((p,i) => ({ id: `paragraph-${i}`, kind: 'paragraph' as const, heading: `Paragraph ${i + 1}`, body: p[key] }));
  return { sections: toSections('after'), original: toSections('before'), trackedChanges, preserveFormatting: true, lockedSections: [], notice: 'Word structure, tables, drawings and supporting parts are preserved. Edit paragraph text here; use Word for structural changes. Review the complete source before sharing.' };
}
