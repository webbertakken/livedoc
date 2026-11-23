// docs/specs/034-text-documents/objects.md "Equations in the formats": an equation is read from LibreOffice's frames
// (in the flat file, or a formula part in the package, its replacement image left behind) and Word's m:oMath and
// m:oMathPara, kept whole when it holds what the model does not map, written back as MathML in the frame and as OMML,
// and carried through a conversion.
import { readOdfPackage, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Inline, Paragraph } from './model/blocks';
import type { Equation, MathNode } from './model/equations';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { docx, fodt, odt, W_P, W_R } from './testing/packages';

const MATHML = 'http://www.w3.org/1998/Math/MathML';
const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const decoder = new TextDecoder();
const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });
const A_OVER_B: MathNode = { kind: 'fraction', numerator: [id('a')], denominator: [id('b')] };

const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  return written.bytes;
};
const paragraphs = (document: TextDocument) =>
  document.body.filter((b): b is Paragraph => b.type === 'paragraph');
const inlinesOf = (document: TextDocument): Inline[] =>
  paragraphs(document).flatMap((p) => p.inlines);
const equationsOf = (document: TextDocument) =>
  inlinesOf(document).filter((i): i is Equation => i.type === 'equation');

/** LibreOffice's frame of a formula: its object, then the replacement image it draws when Math is missing. */
const LO_FRAME = (
  object: string,
  image = '<draw:image><office:binary-data>VkNMTVRG</office:binary-data></draw:image>',
) =>
  `<draw:frame draw:style-name="fr2" draw:name="Object1" text:anchor-type="as-char" svg:width="1.0709in" svg:height="0.3953in" draw:z-index="0">${object}${image}</draw:frame>`;
const LO_MATH = `<math xmlns="${MATHML}" display="block"><semantics><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac><mo stretchy="false">+</mo><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="StarMath 5.0">{a} over {b} + {x} ^ {2}</annotation></semantics></math>`;
const SVG = 'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';

describe('an equation read from an OpenDocument file', () => {
  it("reads LibreOffice's flat file: the MathML in the frame, its annotation and replacement left behind", async () => {
    const r = await read(
      fodt(
        `<text:p>Inline ${LO_FRAME(`<draw:object>${LO_MATH}</draw:object>`)} after.</text:p>`.replace(
          '<draw:frame',
          `<draw:frame ${SVG}`,
        ),
      ),
    );
    expect(inlinesOf(r.document).map((i) => i.type)).toEqual(['run', 'equation', 'run']);
    expect(equationsOf(r.document)[0]).toEqual({
      type: 'equation',
      math: [A_OVER_B, op('+'), { kind: 'scripts', base: [id('x')], sup: [num('2')] }],
      props: {},
    });
    expect(r.report).toEqual({ dropped: [], kept: [] });
  });

  it("reads LibreOffice's package: the formula part its object names, its entries no longer kept", async () => {
    const frame = LO_FRAME(
      '<draw:object xlink:href="./Object 1" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>',
      '<draw:image xlink:href="./ObjectReplacements/Object 1" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>',
    ).replace('<draw:frame', `<draw:frame ${SVG}`);
    const r = await read(
      odt(`<text:p>${frame}</text:p>`, {
        entries: [
          { name: 'Object 1/content.xml', data: `<?xml version="1.0"?>${LO_MATH}` },
          {
            name: 'Object 1/settings.xml',
            data: '<?xml version="1.0"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>',
          },
          { name: 'ObjectReplacements/Object 1', data: new Uint8Array([1, 2, 3]) },
          { name: 'Pictures/kept.bin', data: new Uint8Array([4]) },
        ],
      }),
    );
    expect(equationsOf(r.document)).toHaveLength(1);
    const source = r.document.source;
    expect(source?.format === 'odf' && source.entries.map((e) => e.name)).toEqual([
      'Pictures/kept.bin',
    ]);
  });

  it('keeps a frame whose maths the model does not map, and reports it', async () => {
    const matrix = `<math xmlns="${MATHML}"><mtable><mtr><mtd><mi>a</mi></mtd></mtr></mtable></math>`;
    const r = await read(
      fodt(
        `<text:p>${LO_FRAME(`<draw:object>${matrix}</draw:object>`).replace('<draw:frame', `<draw:frame ${SVG}`)}</text:p>`,
      ),
    );
    expect(equationsOf(r.document)).toEqual([]);
    expect(r.report.kept).toEqual([{ name: 'frame', count: 1 }]);
  });

  it('keeps a formula frame anchored to its paragraph', async () => {
    const frame = LO_FRAME(`<draw:object>${LO_MATH}</draw:object>`).replace('as-char', 'paragraph');
    const r = await read(
      fodt(`<text:p>${frame.replace('<draw:frame', `<draw:frame ${SVG}`)}</text:p>`),
    );
    expect(equationsOf(r.document)).toEqual([]);
  });
});

describe('an equation read from a Word file', () => {
  const run = (text: string, rPr = '') => `<m:r>${rPr}<m:t>${text}</m:t></m:r>`;
  const FRACTION = `<m:f><m:num>${run('a')}</m:num><m:den>${run('b')}</m:den></m:f>`;

  it('reads m:oMath in line, its size and colour from its first run, its maths font left behind', async () => {
    const rPr =
      '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:color w:val="1155CC"/><w:sz w:val="28"/></w:rPr>';
    const r = await read(
      docx(
        W_P(
          `${W_R('Inline ')}<m:oMath ${M}><m:f><m:num><m:r>${rPr}<m:t>a</m:t></m:r></m:num><m:den>${run('b')}</m:den></m:f></m:oMath>${W_R(' after.')}`,
        ),
      ),
    );
    expect(equationsOf(r.document)).toEqual([
      { type: 'equation', math: [A_OVER_B], props: { size: 14, color: '#1155cc' } },
    ]);
    expect(paragraphs(r.document)[0]!.props.align).toBeUndefined();
    expect(r.report).toEqual({ dropped: [], kept: [] });
  });

  it('reads m:oMathPara as its equations, the paragraph centred by default', async () => {
    const r = await read(
      docx(W_P(`<m:oMathPara ${M}><m:oMath>${FRACTION}</m:oMath></m:oMathPara>`)),
    );
    expect(equationsOf(r.document).map((e) => e.math)).toEqual([[A_OVER_B]]);
    expect(paragraphs(r.document)[0]!.props.align).toBe('center');
  });

  it("reads m:oMathPara's alignment, unless the paragraph sets its own", async () => {
    const para = (jc: string, pPr = '') =>
      W_P(
        `${pPr}<m:oMathPara ${M}><m:oMathParaPr><m:jc m:val="${jc}"/></m:oMathParaPr><m:oMath>${FRACTION}</m:oMath></m:oMathPara>`,
      );
    const r = await read(
      docx(para('left') + para('right', '<w:pPr><w:jc w:val="center"/></w:pPr>')),
    );
    expect(paragraphs(r.document).map((p) => p.props.align)).toEqual(['start', 'center']);
  });

  it('reads an equation inside a link with the link', async () => {
    const r = await read(
      docx(W_P(`<w:hyperlink w:anchor="here"><m:oMath ${M}>${FRACTION}</m:oMath></w:hyperlink>`)),
    );
    expect(equationsOf(r.document)[0]!.link).toBe('#here');
  });

  it('keeps an m:oMathPara whole when one of its equations is not mapped', async () => {
    const matrix = `<m:oMath><m:m><m:mr><m:e>${run('a')}</m:e></m:mr></m:m></m:oMath>`;
    const r = await read(
      docx(W_P(`<m:oMathPara ${M}><m:oMath>${FRACTION}</m:oMath>${matrix}</m:oMathPara>`)),
    );
    expect(equationsOf(r.document)).toEqual([]);
    expect(r.report.kept).toEqual([{ name: 'oMathPara', count: 1 }]);
    expect(paragraphs(r.document)[0]!.props.align).toBeUndefined();
  });
});

describe('an equation written', () => {
  it('writes MathML inside its frame in the content part, no formula part and no replacement', async () => {
    const bytes = write(CONSTRUCTS.equations!('odf'), 'odt');
    const pkg = await readOdfPackage(new Uint8Array(bytes));
    if (!pkg.ok) throw new Error('unread');
    const names = [...pkg.package.entries.keys()];
    expect(names.some((n) => n.startsWith('Object') || n.startsWith('ObjectReplacements'))).toBe(
      false,
    );
    const content = decoder.decode(pkg.package.entries.get('content.xml'));
    expect(content).toContain(`<draw:object><math xmlns="${MATHML}"><mrow><mfrac>`);
  });

  it('writes OMML, a paragraph of only equations as m:oMathPara aligned as the paragraph', async () => {
    const pkg = await readOoxmlPackage(
      new Uint8Array(write(CONSTRUCTS.equations!('ooxml'), 'docx')),
    );
    if (!pkg.ok) throw new Error('unread');
    const xml = decoder.decode(pkg.package.parts.get('word/document.xml'));
    expect(xml).toContain(
      '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:f><m:num>',
    );
    expect(xml).toMatch(
      /<m:oMathPara xmlns:m="[^"]+"><m:oMathParaPr><m:jc m:val="center"\/><\/m:oMathParaPr><m:oMath /,
    );
    expect(xml).toContain('<w:rFonts w:ascii="Cambria Math"');
  });
});

describe('an equation converted', () => {
  it.each([
    ['odf', 'ooxml'],
    ['ooxml', 'odf'],
  ] as const)('carries every node from %s to %s, nothing lost', (from, to) => {
    const document = CONSTRUCTS.equations!(from);
    const { document: converted, losses } = convertTextDocument(document, to);
    expect(equationsOf(converted)).toEqual(equationsOf(document));
    expect(losses).toEqual([]);
  });
});
