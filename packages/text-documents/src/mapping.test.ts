import { describe, expect, it } from 'vitest';
import { readTextDocumentFile } from './files';
import { isTextDocumentFileType } from './file-types';
import { ListDefinition } from './model/lists';
import type { Paragraph } from './model/blocks';
import { docx, fodt, W_P, W_R } from './testing/packages';
import { RELATIONSHIP_TYPES } from '@livedoc/office-packages';

const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const paragraphs = (doc: Awaited<ReturnType<typeof read>>) =>
  doc.body.filter((b): b is Paragraph => b.type === 'paragraph');

const STYLES =
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';

// docs/specs/034-text-documents/standard-mapping.md "What the model holds": the ODF properties as other suites write them.
describe('ODF properties as files write them', () => {
  it('reads weights, slants, positions, transforms and keep rules in every form', async () => {
    const auto = (name: string, family: string, props: string) =>
      `<style:style ${STYLES} style:name="${name}" style:family="${family}">${props}</style:style>`;
    const file = new TextEncoder().encode(
      `<?xml version="1.0"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ${STYLES} office:mimetype="application/vnd.oasis.opendocument.text"><office:automatic-styles>${[
        auto(
          'T1',
          'text',
          '<style:text-properties fo:font-weight="700" fo:font-style="oblique" style:text-position="33% 58%" fo:font-family="\'DejaVu Sans\'" fo:font-size="120%"/>',
        ),
        auto(
          'T2',
          'text',
          '<style:text-properties fo:font-weight="400" style:text-position="-33% 58%" fo:text-transform="sideways" fo:background-color="transparent"/>',
        ),
        auto('T3', 'text', '<style:text-properties style:text-position="x"/>'),
        auto(
          'P1',
          'paragraph',
          '<style:paragraph-properties fo:text-align="left" fo:widows="3" fo:orphans="2" fo:margin-left="10%" fo:break-before="auto" fo:line-height="normal"/>',
        ),
        auto(
          'P2',
          'paragraph',
          '<style:paragraph-properties fo:text-align="right" fo:widows="0" fo:orphans="0"/>',
        ),
      ].join(
        '',
      )}</office:automatic-styles><office:body><office:text><text:p text:style-name="P1"><text:span text:style-name="T1">a</text:span><text:span text:style-name="T2">b</text:span><text:span text:style-name="T3">c</text:span><text:span text:style-name="Named">d</text:span></text:p><text:p text:style-name="P2"><text:s text:c="x"/>e</text:p></office:text></office:body></office:document>`,
    );
    const [first, second] = paragraphs(await read(file));
    expect(first!.props).toEqual({ align: 'start', pageBreakBefore: false });
    expect(first!.inlines.map((i) => [i.props, i.style])).toEqual([
      [{ bold: true, italic: true, vertical: 'super', font: 'DejaVu Sans' }, undefined],
      [{ bold: false, vertical: 'sub' }, undefined],
      [{}, undefined],
      [{}, 'Named'],
    ]);
    expect(second!.props).toEqual({ align: 'end', widowControl: false });
    expect(second!.inlines[0]!.type === 'run' && second!.inlines[0]!.text).toBe(' e');
  });

  it('reads list styles: prefixes, shown levels, start values and bullets of no format', async () => {
    const file = fodt(
      `<text:list text:style-name="L1"><text:list-item><text:p>a</text:p></text:list-item></text:list><text:list text:continue-numbering="true" text:style-name="L1"><text:list-item><text:p>b</text:p></text:list-item></text:list><text:list text:style-name="Missing"><text:list-header><text:p>h</text:p></text:list-header></text:list>`,
    );
    const withStyles = new TextDecoder()
      .decode(file)
      .replace(
        '<office:body>',
        `<office:automatic-styles><text:list-style ${STYLES} style:name="L1"><text:list-level-style-number text:level="1" style:num-prefix="(" style:num-suffix=")" style:num-format="i" text:start-value="4"/><text:list-level-style-number text:level="2" style:num-format="" /><text:list-level-style-number text:level="3" style:num-format="A" text:display-levels="3"/><text:list-level-style-bullet text:level="4" text:bullet-char="☑"/><text:list-level-style-bullet text:level="12"/></text:list-style></office:automatic-styles><office:body>`,
      );
    const doc = await read(new TextEncoder().encode(withStyles));
    const [a, b, h] = paragraphs(doc);
    expect(a!.list!.id).toBe(b!.list!.id);
    expect(h!.list).toMatchObject({ unnumbered: true });
    const levels = doc.lists[a!.list!.id]!.levels;
    expect(levels.slice(0, 4)).toEqual([
      { kind: 'number', format: 'lower-roman', label: '(%1)', start: 4 },
      { kind: 'bullet', bullet: '' },
      { kind: 'number', format: 'upper-letter', label: '%1.%2.%3', start: 1 },
      { kind: 'check' },
    ]);
    expect(doc.lists[h!.list!.id]).toEqual(ListDefinition.of('bullet'));
  });
});

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// standard-mapping.md "What the model holds" and "Conformance": WordprocessingML as Word writes it, Strict included.
describe('WordprocessingML properties as files write them', () => {
  it('reads toggles, alignments, outline levels, exact and at-least spacing, start and end indents', async () => {
    const doc = await read(
      docx(
        W_P(
          `<w:pPr><w:jc w:val="distribute"/><w:outlineLvl w:val="9"/><w:spacing w:line="360" w:lineRule="exact"/><w:ind w:start="720" w:end="360" w:firstLine="360"/><w:keepNext w:val="off"/></w:pPr><w:r><w:rPr><w:b w:val="false"/><w:caps w:val="0"/><w:u w:val="none"/><w:vertAlign w:val="baseline"/><w:highlight w:val="none"/><w:shd w:fill="auto"/></w:rPr><w:t>a</w:t><w:cr/><w:noBreakHyphen/><w:softHyphen/><w:lastRenderedPageBreak/><w:br w:type="page"/></w:r>`,
        ) +
          W_P(
            `<w:pPr><w:spacing w:line="300" w:lineRule="atLeast"/><w:outlineLvl w:val="2"/></w:pPr>${W_R('b')}`,
          ),
      ),
    );
    const [a, b] = paragraphs(doc);
    expect(a!.props).toEqual({
      align: 'justify',
      outlineLevel: 0,
      lineHeight: { rule: 'exact', pt: 18 },
      indentStart: 36,
      indentEnd: 18,
      indentFirst: 18,
      keepWithNext: false,
    });
    expect(a!.inlines.map((i) => (i.type === 'kept' ? i.name : i.type === 'note' ? '' : i.text))).toEqual([
      'a\n\u2011\u00ad',
      'br',
    ]);
    expect(a!.inlines[0]!.props).toEqual({
      bold: false,
      transform: 'none',
      underline: false,
      vertical: 'baseline',
    });
    expect(b!.props).toEqual({ lineHeight: { rule: 'atLeast', pt: 15 }, outlineLevel: 3 });
  });

  it('reads numbering with level overrides and start overrides, and a checklist', async () => {
    const numbering = `<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/><w:lvlText w:val="☐"/></w:lvl><w:lvl w:ilvl="12"/></w:abstractNum><w:num w:numId="3"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="7"/></w:lvlOverride><w:lvlOverride w:ilvl="2"><w:lvl w:ilvl="2"><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%3)"/></w:lvl></w:lvlOverride><w:lvlOverride w:ilvl="20"/></w:num><w:numIdMacAtCleanup w:val="1"/></w:numbering>`;
    const doc = await read(
      docx(
        W_P(
          `<w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr></w:pPr>${W_R('task')}`,
        ) + W_P(`<w:pPr><w:numPr><w:numId w:val="0"/></w:numPr></w:pPr>${W_R('none')}`),
        {
          rels: `<Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.numbering}" Target="numbering.xml"/>`,
          entries: [{ name: 'word/numbering.xml', data: numbering }],
        },
      ),
    );
    const [task, none] = paragraphs(doc);
    expect(task!.list).toEqual({ id: '3', level: 1 });
    expect(none!.list).toBeUndefined();
    expect(doc.lists['3']!.levels.slice(0, 3)).toEqual([
      { kind: 'number', format: 'upper-roman', label: '%1.', start: 7 },
      { kind: 'check' },
      { kind: 'number', format: 'lower-letter', label: '%3)', start: 1 },
    ]);
    expect(ListDefinition.kindAt(doc.lists['3'], 1)).toBe('check');
    expect(ListDefinition.kindAt(undefined, 0)).toBe('bullet');
  });

  // lists.md "In the formats": Word restarts a list with a num of the same abstract numbering and a start override.
  it('reads a later num of one abstract numbering as its list, restarted at its start overrides or continued', async () => {
    const lvl = (at: number) =>
      `<w:lvl w:ilvl="${at}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${at + 1}."/></w:lvl>`;
    const numbering = `<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0">${lvl(0)}${lvl(1)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/></w:lvlOverride></w:num><w:num w:numId="3"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="4"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0">${lvl(0)}</w:lvlOverride></w:num><w:num w:numId="5"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="30"><w:startOverride w:val="2"/></w:lvlOverride></w:num></w:numbering>`;
    const item = (num: string, text: string, level = 0) =>
      W_P(
        `<w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr></w:pPr>${W_R(text)}`,
      );
    const doc = await read(
      docx(
        item('1', 'one') +
          item('2', 'deeper first', 1) +
          item('2', 'four') +
          item('2', 'five') +
          item('3', 'six') +
          item('4', 'own') +
          item('5', 'odd'),
        {
          rels: `<Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.numbering}" Target="numbering.xml"/>`,
          entries: [{ name: 'word/numbering.xml', data: numbering }],
        },
      ),
    );
    expect(paragraphs(doc).map((p) => p.list)).toEqual([
      { id: '1', level: 0 },
      { id: '1', level: 1 },
      { id: '1', level: 0, restart: 4 },
      { id: '1', level: 0 },
      { id: '1', level: 0 },
      // A num with a level of its own, or an override out of range, is a list of its own.
      { id: '4', level: 0 },
      { id: '5', level: 0 },
    ]);
    expect(Object.keys(doc.lists).sort()).toEqual(['1', '4', '5']);
  });

  it('reads ISO/IEC 29500 Strict names as Transitional ones', async () => {
    const strict = docx('').slice(0);
    const text = new TextDecoder('latin1').decode(strict);
    expect(text.length).toBeGreaterThan(0);
    const body = `<w:p xmlns:w="http://purl.oclc.org/ooxml/wordprocessingml/main"><w:r><w:rPr><w:b/></w:rPr><w:t>strict</w:t></w:r></w:p>`;
    const doc = await read(docx(body));
    expect(paragraphs(doc)[0]!.inlines[0]).toMatchObject({ text: 'strict', props: { bold: true } });
  });
});

describe('file types', () => {
  it('knows the files a text document leaves as', () => {
    expect(isTextDocumentFileType('fodt')).toBe(true);
    expect(isTextDocumentFileType('pdf')).toBe(false);
  });
});
