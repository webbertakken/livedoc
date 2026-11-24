// docs/specs/034-text-documents/standard-mapping.md "Kept content", "Shown as it reads".
import { describe, expect, it } from 'vitest';
import { keptBreakOf, keptPresenceOf, keptShownText } from './kept-presence';

describe('keptPresenceOf', () => {
  it('hides what has nothing to see, in either format', () => {
    for (const name of [
      'sequence-decls',
      'bookmark-start',
      'bookmarkStart',
      'commentRangeEnd',
      'proofErr',
    ])
      expect(keptPresenceOf(name)).toBe('hidden');
  });

  it('breaks the line for a kept line break', () => {
    expect(keptPresenceOf('br')).toBe('break');
    expect(keptPresenceOf('line-break')).toBe('break');
  });

  it('shows anything else as the placeholder', () => {
    for (const name of ['tbl', 'table', 'footnoteReference', 'note', 'drawing'])
      expect(keptPresenceOf(name)).toBe('placeholder');
  });
});

describe('keptBreakOf (page-layout.md "Breaks")', () => {
  it("reads a Word page or column break from the kept run, whatever the file's prefix", () => {
    expect(keptBreakOf('br', '<w:r><w:br w:type="page"/></w:r>')).toBe('page');
    expect(keptBreakOf('br', '<x:r><x:rPr/><x:br x:type="column"/></x:r>')).toBe('column');
  });

  it('reads anything else as no page or column break', () => {
    expect(keptBreakOf('br', '<w:r><w:br/></w:r>')).toBeNull();
    expect(keptBreakOf('br', '<w:r><w:br w:type="textWrapping"/></w:r>')).toBeNull();
    expect(keptBreakOf('drawing', '<w:r><w:br w:type="page"/></w:r>')).toBeNull();
  });
});

// "Shown as it reads": a content control inside a paragraph (a date picker, a dropdown, a chip) shows its text.
describe('keptShownText', () => {
  it('reads a Word content control’s text from its content, not its properties', () => {
    const xml =
      '<w:sdt><w:sdtPr><w:dropDownList><w:listItem w:displayText="No" w:value="No"/></w:dropDownList></w:sdtPr>' +
      '<w:sdtContent><w:r><w:t>Nov 24,</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> 2026 &amp; on</w:t></w:r></w:sdtContent></w:sdt>';
    expect(keptShownText('sdt', xml)).toBe('Nov 24,\t 2026 & on');
  });

  it('reads a LibreOffice content control’s text, its list items left out', () => {
    const xml =
      '<loext:content-control loext:dropdown="true"><loext:list-item loext:display-text="A" loext:value="A"/>' +
      '<text:span text:style-name="T1">Approved</text:span> &lt;ok&gt;</loext:content-control>';
    expect(keptShownText('content-control', xml)).toBe('Approved <ok>');
  });

  it('shows nothing as text for anything else, or a control with no text', () => {
    expect(
      keptShownText('fldSimple', '<w:fldSimple><w:r><w:t>x</w:t></w:r></w:fldSimple>'),
    ).toBeNull();
    expect(keptShownText('sdt', '<w:sdt><w:sdtContent/></w:sdt>')).toBeNull();
  });
});
