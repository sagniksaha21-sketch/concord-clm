import { BadRequestException } from '@nestjs/common';
import { DraftSection } from '@concord/shared';
import { zip } from '../reports/zip';
import { readEditableDocument, readWordPackage } from './read-document';
const fail = (message: string): never => { throw new BadRequestException(message); };
const escape = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[c]!));
/** Find complete top-level Word paragraphs without flattening nested drawing text. */
function paragraphs(xml: string) {
  const spans: { start: number; end: number; xml: string }[] = [];
  let depth = 0, start = 0;
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*|)>|<\/w:p>/g)) {
    if (match[0].startsWith('</')) { if (--depth === 0) spans.push({ start, end: match.index!+match[0].length, xml: xml.slice(start,match.index!+match[0].length) }); }
    else { if (depth === 0) start = match.index!; depth++; }
  }
  return spans;
}
const protectedContent = /<w:(?:drawing|pict|fldChar|fldSimple|instrText|footnoteReference|endnoteReference|sdt|bookmarkStart|commentRangeStart)\b|<m:/;
function paragraphText(xml: string) {
  const bytes = zip([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'word/document.xml', data: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xml}</w:body></w:document>` }]);
  try { return readEditableDocument(bytes,'paragraph.docx').sections[0]?.body; }
  catch (error) {
    if (error instanceof BadRequestException && error.message.startsWith('No editable text was found.')) return undefined;
    throw error;
  }
}
export function wordLockedSections(bytes: Buffer): string[] {
  const xml = readWordPackage(bytes).find(e => e.name === 'word/document.xml')!.data.toString('utf8');
  let index = 0; const locked: string[] = [];
  for (const span of paragraphs(xml)) {
    if (paragraphText(span.xml) === undefined) continue;
    if (protectedContent.test(span.xml)) locked.push(`paragraph-${index}`);
    index++;
  }
  return locked;
}
/** Unchanged OOXML parts remain byte-for-byte identical. Only changed text paragraphs are rewritten. */
export function preserveWord(bytes: Buffer, sections: DraftSection[], acceptTrackedChanges = false): Buffer {
  const source = readEditableDocument(bytes,'source.docx');
  if (sections.length !== source.sections.length || sections.some((s,i) => s.id !== source.sections[i].id || s.heading !== source.sections[i].heading)) return fail('Use Word to insert, remove or reorder paragraphs in a formatted document. Its structure has been preserved.');
  const entries = readWordPackage(bytes), main = entries.find(e => e.name === 'word/document.xml')!;
  let xml = main.data.toString('utf8'), index = 0;
  const replacements: { start: number; end: number; text: string }[] = [];
  for (const span of paragraphs(xml)) {
    const body = paragraphText(span.xml);
    if (body === undefined) continue;
    const next = sections[index++];
    if (!next) return fail('The Word outline changed. Reload the source.');
    if (next.body === body) continue;
    if (protectedContent.test(span.xml)) return fail('This paragraph contains a drawing, field, note or anchored comment. Edit it in Word to preserve its content.');
    const opening = span.xml.match(/^<w:p(?:\s[^>]*|)>/)![0];
    const properties = span.xml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/)?.[0] ?? '';
    const runProperties = span.xml.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/)?.[0] ?? '';
    const content = escape(next.body).replace(/\n/g,'</w:t><w:br/><w:t xml:space="preserve">').replace(/\t/g,'</w:t><w:tab/><w:t xml:space="preserve">');
    replacements.push({ ...span, text: `${opening}${properties}<w:r>${runProperties}<w:t xml:space="preserve">${content}</w:t></w:r></w:p>` });
  }
  if (index !== sections.length) return fail('This Word outline needs document exchange; no content was discarded.');
  for (const r of replacements.reverse()) xml = xml.slice(0,r.start)+r.text+xml.slice(r.end);
  if (acceptTrackedChanges) {
    xml = xml.replace(/<w:(del|moveFrom)\b[^>]*>[\s\S]*?<\/w:\1>/g,'');
    xml = xml.replace(/<w:(?:ins|moveTo)\b[^>]*>|<\/w:(?:ins|moveTo)>/g,'');
  }
  main.data = Buffer.from(xml);
  const result = zip(entries);
  const checked = readEditableDocument(result,'saved.docx');
  if (checked.sections.length !== sections.length || checked.sections.some((s,i) => s.body !== sections[i].body)) return fail('Word preservation check failed. Keep the original and continue this edit in Word.');
  return result;
}

/** Fail closed for packages outside the reviewed sharing profile. Never export hidden comments or custom data. */
export function cleanWordForSharing(bytes: Buffer): Buffer {
  const parts = readWordPackage(bytes);
  const removed = /^(?:docProps\/|customXml\/|word\/comments[^/]*\.xml$|word\/people\.xml$)/;
  const allowed = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|word\/(?:document|styles|stylesWithEffects|numbering|settings|webSettings|fontTable|footnotes|endnotes|header\d*|footer\d*)\.xml|word\/(?:theme\/theme\d+\.xml|media\/[^/]+|fonts\/[^/]+|_rels\/[^/]+\.rels))$/;
  const clean = parts.filter(p => !removed.test(p.name));
  for (const part of clean) {
    if (!allowed.test(part.name)) return fail('This Word package needs manual document inspection before external sharing.');
    if (!/\.xml$|\.rels$/.test(part.name)) continue;
    let xml = part.data.toString('utf8');
    // Pending revisions and hidden runs may contain internal positions. Resolve them in Word first.
    if (/<w:(?:ins|del|moveFrom|moveTo|\w+PrChange|vanish|webHidden|docVars)\b/.test(xml)) return fail('Resolve tracked changes and hidden text in Word before preparing an external copy.');
    xml = xml.replace(/<w:(?:commentRangeStart|commentRangeEnd|commentReference)\b[^>]*\/>/g,'');
    xml = xml.replace(/<Relationship\b[^>]*\/>/g,tag => {
      const type = tag.match(/Type="([^"]+)"/)?.[1] ?? '';
      if (/comments|people|customXml|metadata\/(?:core|extended|custom)-properties|extended-properties|custom-properties/.test(type)) return '';
      if (/TargetMode="External"/.test(tag) && !/\/hyperlink$/.test(type)) return fail('External document references must be removed in Word before sharing.');
      return tag;
    });
    xml = xml.replace(/<Override\b[^>]*\/>/g,tag => {
      const name = tag.match(/PartName="\/([^"]+)"/)?.[1] ?? '';
      return removed.test(name) ? '' : tag;
    });
    part.data = Buffer.from(xml);
  }
  return zip(clean);
}
