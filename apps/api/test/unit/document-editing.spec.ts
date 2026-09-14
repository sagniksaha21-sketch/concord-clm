import { zip } from '../../src/reports/zip';
import { draftDocument } from '../../src/agreements/draft-document';
import { readEditableDocument } from '../../src/agreements/read-document';
import { compareSections } from '@concord/shared';
const office = (body: string) => zip([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'word/document.xml', data: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>` }]);

describe('Safe document editing and comparison', () => {
  it('reads real persisted Word bytes without losing Unicode or paragraph order', () => {
    const file = draftDocument('Lakmē — Agreement', [{ heading: 'Payment', body: '₹25,000 & tax\nDue in 30 days.' }]);
    const result = readEditableDocument(file, 'agreement.docx');
    expect(result.sections.map(s => s.body)).toEqual(['Lakmē — Agreement','Payment','₹25,000 & tax','Due in 30 days.']);
    expect(result.trackedChanges).toBe(false);
    const saved = readEditableDocument(draftDocument('Unused title',result.sections), 'saved.docx');
    expect(saved.sections.map(s => s.body)).toEqual(result.sections.map(s => s.body));
  });
  it('separates original and proposed Word tracked language', () => {
    const file = office('<w:p><w:r><w:t>Liability cap: </w:t></w:r><w:del w:author="External"><w:r><w:delText>1× fees</w:delText></w:r></w:del><w:ins w:author="External"><w:r><w:t>2× fees</w:t></w:r></w:ins></w:p>');
    const result = readEditableDocument(file,'redline.docx');
    expect(result.original[0].body).toBe('Liability cap: 1× fees');
    expect(result.sections[0].body).toBe('Liability cap: 2× fees');
    expect(result.trackedChanges).toBe(true);
    expect(compareSections(result.original,result.sections)[0].kind).toBe('modified');
  });
  it('detects stable clause moves, insertions and deletions', () => {
    const before = [{ id: 'a', heading: 'A', body: 'One' },{ id: 'b', heading: 'B', body: 'Two' }];
    const after = [{ ...before[1] },{ id: 'c', heading: 'C', body: 'New' }];
    expect(compareSections(before,after).map(c => `${c.id}:${c.kind}`)).toEqual(['b:moved','c:added','a:deleted']);
  });
  it('rejects an XML entity attack before parsing', () => {
    const file = office('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><w:p><w:r><w:t>&x;</w:t></w:r></w:p>');
    expect(() => readEditableDocument(file,'attack.docx')).toThrow('referenced content');
  });
  it('rejects duplicate document parts and traversal entries', () => {
    for (const extra of ['word/document.xml','../document.xml']) {
      const file = zip([{ name: '[Content_Types].xml', data: '<Types/>' },{ name: 'word/document.xml', data: '<document/>' },{ name: extra, data: '<document/>' }]);
      expect(() => readEditableDocument(file,'bad.docx')).toThrow('unsafe');
    }
  });
  it('refuses conversion when tables or embedded objects would be lost', () => {
    expect(() => readEditableDocument(office('<w:tbl><w:tr/></w:tbl>'),'table.docx')).toThrow('Continue editing it in Word');
  });
  it('rejects nested markup before expensive recursive parsing', () => {
    const file = office('<w:r>'.repeat(100) + 'text' + '</w:r>'.repeat(100));
    expect(() => readEditableDocument(file,'deep.docx')).toThrow('too complex');
  });
  it('rejects oversized decompression even if the archive advertises a smaller size', () => {
    const file = office('<w:p>'+'x'.repeat(5*1024*1024)+'</w:p>');
    expect(() => readEditableDocument(file,'bomb.docx')).toThrow('safe import limits');
  });
  it('detects damaged compressed content', () => {
    const file = office('<w:p><w:r><w:t>Terms</w:t></w:r></w:p>');
    const position = file.indexOf(Buffer.from('word/document.xml')) + 'word/document.xml'.length;
    file[position] ^= 255;
    expect(() => readEditableDocument(file,'broken.docx')).toThrow();
  });
  it('supports text and gives an actionable response for unsupported files', () => {
    expect(readEditableDocument(Buffer.from('Scope\n\n₹10,000'),'scope.txt').sections).toHaveLength(2);
    expect(() => readEditableDocument(Buffer.from('%PDF-1.7'),'contract.pdf')).toThrow('upload a Word copy');
  });
});
