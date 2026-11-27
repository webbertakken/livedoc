// docs/specs/034-text-documents/objects.md "In the formats": a picture placed out of its line read one to one as
// LibreOffice 24.2 reads and writes it (its wrap, margins, movement and offsets), written as LibreOffice and Word write
// it; any other placement, or one in a note or a header, keeps the picture.
import { readOdfPackage, readOoxmlPackage, RELATIONSHIP_TYPES } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Inline } from './model/blocks';
import type { PicturePlacement } from './model/picture-placement';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { docx } from './testing/packages';
import {
  ALIGNED_ANCHOR,
  IMAGE_REL,
  LO_FRAME,
  loOdt,
  R_NS,
  wordDocx,
  wordPicture,
  type WordAnchor,
} from './testing/picture-files';
import { GREEN_PNG } from './testing/pictures';

const decoder = new TextDecoder();
const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  return new Uint8Array(written.bytes);
};
const inlinesOf = (document: TextDocument): Inline[] =>
  document.body.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
const placementsOf = (document: TextDocument) =>
  inlinesOf(document).flatMap((i) => (i.type === 'picture' ? [i.placement] : []));
const keptNames = (document: TextDocument) =>
  inlinesOf(document).flatMap((i) => (i.type === 'kept' ? [i.name] : []));

// As LibreOffice 24.2 writes a picture wrapped with a margin of 0.05 in above and below and 0.1 in beside, 1 in across
// and 0.5 in down from its paragraph.
const WRAPPED: PicturePlacement = {
  wrap: 'wrap',
  margin: { top: 3.6, right: 7.2, bottom: 3.6, left: 7.2 },
  moves: 'with-text',
  x: 72,
  y: 36,
};
const position = (h: string, v: string, x = 914400, y = 457200) =>
  `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${h}"><wp:posOffset>${x}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="${v}"><wp:posOffset>${y}</wp:posOffset></wp:positionV>`;
const LO_ANCHOR: Required<WordAnchor> = {
  dist: 'distT="45720" distB="45720" distL="91440" distR="91440"',
  attrs:
    ' behindDoc="0" simplePos="0" locked="0" layoutInCell="0" allowOverlap="1" relativeHeight="2"',
  position: position('column', 'paragraph'),
  wrap: '<wp:wrapSquare wrapText="bothSides"/>',
};
const word = (anchor: WordAnchor) => wordDocx(wordPicture({ anchor: { ...LO_ANCHOR, ...anchor } }));

const ODF_GRAPHIC = (properties: string) =>
  `<style:style style:name="fr2" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties ${properties}/></style:style>`;
const LO_WRAPPED =
  'style:wrap="parallel" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false" fo:margin-left="0.1in" fo:margin-right="0.1in" fo:margin-top="0.05in" fo:margin-bottom="0.05in" style:vertical-pos="from-top" style:vertical-rel="paragraph" style:horizontal-pos="from-left" style:horizontal-rel="paragraph" style:mirror="none" fo:clip="rect(0in, 0in, 0in, 0in)"';
const libre = (properties: string, anchor = 'char', offsets = ' svg:x="1in" svg:y="0.5in"') =>
  loOdt(LO_FRAME({ anchor, attrs: offsets }), ODF_GRAPHIC(properties));

describe("Word's placed picture", () => {
  it.each<[string, WordAnchor, PicturePlacement]>([
    ['wrapped, moving with its text', {}, WRAPPED],
    ['breaking the text', { wrap: '<wp:wrapTopAndBottom/>' }, { ...WRAPPED, wrap: 'break' }],
    [
      'in front of the text, fixed on the page',
      {
        wrap: '<wp:wrapNone/>',
        dist: 'distT="0" distB="0" distL="0" distR="0"',
        position: position('page', 'page', 0, -12700),
      },
      {
        wrap: 'front',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        moves: 'page',
        x: 0,
        y: -1,
      },
    ],
    [
      'behind the text',
      {
        wrap: '<wp:wrapNone/>',
        attrs:
          ' behindDoc="1" simplePos="0" locked="0" layoutInCell="1" allowOverlap="1" relativeHeight="3"',
      },
      { ...WRAPPED, wrap: 'behind' },
    ],
  ])('is read %s', async (_, anchor, placement) => {
    expect(placementsOf(await read(word(anchor)))).toEqual([placement]);
  });

  it.each<[string, WordAnchor]>([
    ['placed by alignment', ALIGNED_ANCHOR],
    ['placed from the margin', { position: position('margin', 'paragraph') }],
    ['placed from the column and the page', { position: position('column', 'page') }],
    ['wrapped on the larger side', { wrap: '<wp:wrapSquare wrapText="largest"/>' }],
    ['wrapped on one side', { wrap: '<wp:wrapSquare wrapText="left"/>' }],
    [
      'wrapped tight',
      {
        wrap: '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="0" y="21600"/></wp:wrapPolygon></wp:wrapTight>',
      },
    ],
    [
      'placed by its simple position',
      {
        attrs:
          ' behindDoc="0" simplePos="1" locked="0" layoutInCell="1" allowOverlap="1" relativeHeight="2"',
      },
    ],
    [
      'hidden',
      {
        attrs:
          ' behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1" relativeHeight="2" hidden="1"',
      },
    ],
    ['with a margin past an inch', { dist: 'distT="1828800" distB="0" distL="0" distR="0"' }],
  ])('is kept %s', async (_, anchor) => {
    expect(keptNames(await read(word(anchor)))).toEqual(['drawing']);
  });

  it('is kept in a header', async () => {
    const document = await read(
      docx(
        `<w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdH"/></w:sectPr>`,
        {
          rels: `<Relationship Id="rIdH" Type="${RELATIONSHIP_TYPES.header}" Target="header1.xml"/>`,
          entries: [
            {
              name: 'word/header1.xml',
              data: `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ${R_NS}><w:p>${wordPicture({ anchor: LO_ANCHOR })}</w:p></w:hdr>`,
            },
            {
              name: 'word/_rels/header1.xml.rels',
              data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${IMAGE_REL('rId5', 'media/image2.png')}</Relationships>`,
            },
            { name: 'word/media/image2.png', data: GREEN_PNG },
          ],
        },
      ),
    );
    const header = document.section.headers?.header?.default?.blocks ?? [];
    const inlines = header.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
    expect(inlines.map((i) => (i.type === 'kept' ? i.name : i.type))).toEqual(['drawing']);
  });
});

describe("LibreOffice's placed picture", () => {
  it.each<[string, string, string | undefined, PicturePlacement]>([
    ['wrapped, moving with its text', LO_WRAPPED, undefined, WRAPPED],
    ['anchored to its paragraph', LO_WRAPPED, 'paragraph', WRAPPED],
    [
      'breaking the text',
      LO_WRAPPED.replace('style:wrap="parallel"', 'style:wrap="none"'),
      undefined,
      { ...WRAPPED, wrap: 'break' },
    ],
    [
      'in front of the text, fixed on the page',
      'style:wrap="run-through" style:run-through="foreground" style:vertical-pos="from-top" style:vertical-rel="page" style:horizontal-pos="from-left" style:horizontal-rel="page"',
      undefined,
      {
        wrap: 'front',
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        moves: 'page',
        x: 72,
        y: 36,
      },
    ],
    [
      'behind the text',
      LO_WRAPPED.replace(
        'style:wrap="parallel"',
        'style:wrap="run-through" style:run-through="background"',
      ),
      undefined,
      { ...WRAPPED, wrap: 'behind' },
    ],
  ])('is read %s', async (_, properties, anchor, placement) => {
    expect(placementsOf(await read(libre(properties, anchor)))).toEqual([placement]);
  });

  it.each([
    ['wrapped on the larger side', LO_WRAPPED.replace('"parallel"', '"dynamic"')],
    [
      'wrapped along its contour',
      LO_WRAPPED.replace('wrap-contour="false"', 'wrap-contour="true"'),
    ],
    ['wrapping one paragraph', LO_WRAPPED.replace('"no-limit"', '"1"')],
    ['centred', LO_WRAPPED.replace('horizontal-pos="from-left"', 'horizontal-pos="center"')],
    [
      'placed from the page content',
      LO_WRAPPED.replace('horizontal-rel="paragraph"', 'horizontal-rel="page-content"'),
    ],
    [
      'placed from the paragraph across and the page down',
      LO_WRAPPED.replace('vertical-rel="paragraph"', 'vertical-rel="page"'),
    ],
  ])('is kept %s', async (_, properties) => {
    expect(keptNames(await read(libre(properties)))).toEqual(['frame']);
  });

  it('is kept anchored to the page', async () => {
    expect(keptNames(await read(libre(LO_WRAPPED, 'page')))).toEqual(['frame']);
  });

  it('is kept in a note', async () => {
    const note = `<text:note text:id="n1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>${LO_FRAME({ anchor: 'char', attrs: ' svg:x="1in" svg:y="0.5in"' })}</text:p></text:note-body></text:note>`;
    const document = await read(loOdt(note, ODF_GRAPHIC(LO_WRAPPED)));
    const [noted] = inlinesOf(document).filter((i) => i.type === 'note');
    const blocks = noted?.type === 'note' ? noted.blocks : [];
    const inlines = blocks.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
    expect(inlines.map((i) => (i.type === 'kept' ? i.name : i.type))).toEqual(['frame']);
  });
});

describe('a placed picture written', () => {
  it("writes Word's anchor as LibreOffice and Word do", async () => {
    const pkg = await readOoxmlPackage(write(CONSTRUCTS.placedPictures!('ooxml'), 'docx'));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const xml = decoder.decode(pkg.package.parts.get('word/document.xml'));
    expect(xml).toMatch(
      /<wp:anchor xmlns:wp="http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/wordprocessingDrawing" distT="45720" distB="45720" distL="91440" distR="91440" simplePos="0" relativeHeight="\d+" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"\/><wp:positionH relativeFrom="column"><wp:posOffset>914400<\/wp:posOffset><\/wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>457200<\/wp:posOffset><\/wp:positionV><wp:extent /,
    );
    expect(xml).toMatch(
      /<wp:effectExtent [^>]*\/><wp:wrapSquare wrapText="bothSides"\/><wp:docPr /,
    );
    expect(xml).toMatch(
      /relativeHeight="\d+" behindDoc="1"[^>]*><wp:simplePos x="0" y="0"\/><wp:positionH relativeFrom="page">/,
    );
    expect(xml).toMatch(/<wp:wrapNone\/><wp:docPr /);
  });

  it("writes the frame's anchor and offsets, and its style's wrap, margins and relations", async () => {
    const pkg = await readOdfPackage(write(CONSTRUCTS.placedPictures!('odf'), 'odt'));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const content = decoder.decode(pkg.package.entries.get('content.xml'));
    expect(content).toMatch(
      /<draw:frame [^>]*text:anchor-type="char"[^>]*svg:x="72pt" svg:y="36pt"/,
    );
    expect(content).toContain(
      'style:wrap="parallel" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false" fo:margin-top="3.6pt" fo:margin-right="7.2pt" fo:margin-bottom="3.6pt" fo:margin-left="7.2pt" style:vertical-pos="from-top" style:vertical-rel="paragraph" style:horizontal-pos="from-left" style:horizontal-rel="paragraph"',
    );
    expect(content).toContain(
      'style:wrap="run-through" style:run-through="background" fo:margin-top="0pt" fo:margin-right="0pt" fo:margin-bottom="0pt" fo:margin-left="0pt" style:vertical-pos="from-top" style:vertical-rel="page" style:horizontal-pos="from-left" style:horizontal-rel="page"',
    );
  });

  it.each(['docx', 'odt', 'fodt'] as const)('reads back as it was written: %s', async (type) => {
    const original = CONSTRUCTS.placedPictures!(type === 'docx' ? 'ooxml' : 'odf');
    expect(placementsOf(await read(write(original, type)))).toEqual(placementsOf(original));
  });

  it('carries them to the other format', async () => {
    const original = CONSTRUCTS.placedPictures!('odf');
    const { document } = convertTextDocument(original, 'ooxml');
    expect(placementsOf(await read(write(document, 'docx')))).toEqual(placementsOf(original));
  });
});
