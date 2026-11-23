// docs/specs/034-text-documents/objects.md "In the formats": a picture's recolour (greyscale, duotone) and adjustments
// (transparency, brightness, contrast) read one to one as LibreOffice reads them, written in the model's order; any
// other recolour or adjustment, or one out of its range, keeps the picture.
import { readOdfPackage, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { TextDocumentFileType } from './file-types';
import type { Inline } from './model/blocks';
import type { PictureColouring } from './model/picture-colours';
import type { Picture } from './model/pictures';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { LO_FRAME, LO_GRAPHIC, loOdt, wordDocx, wordPicture } from './testing/picture-files';

const decoder = new TextDecoder();
const read = async (bytes: Uint8Array) => {
  const r = await readTextDocumentFile(bytes);
  if (!r.ok) throw new Error(r.rejection);
  return r.document;
};
const write = (document: TextDocument, type: TextDocumentFileType) => {
  const written = writeTextDocumentFile(document, type);
  if (!written.ok) throw new Error(written.rejection);
  return written.bytes;
};
const inlinesOf = (document: TextDocument): Inline[] =>
  document.body.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
const colouringOf = (document: TextDocument) =>
  inlinesOf(document)
    .filter((i): i is Picture => i.type === 'picture')
    .map(({ recolour, transparency, brightness, contrast }): PictureColouring =>
      Object.fromEntries(
        Object.entries({ recolour, transparency, brightness, contrast }).filter(
          ([, v]) => v !== undefined,
        ),
      ),
    );
const keptNames = (document: TextDocument) =>
  inlinesOf(document).flatMap((i) => (i.type === 'kept' ? [i.name] : []));
const LIVEDOC_DUOTONE = 'xmlns:livedoc="urn:livedoc:xmlns:text:1.0" livedoc:duotone';
/** LibreOffice's graphic style with its neutral values changed or added. */
const loGraphic = (changes: Record<string, string>) =>
  Object.entries(changes).reduce(
    (graphic, [name, value]) =>
      graphic.includes(` ${name}="`)
        ? graphic.replace(new RegExp(` ${name}="[^"]*"`), ` ${name}="${value}"`)
        : graphic.replace('/>', ` ${name}="${value}"/>`),
    LO_GRAPHIC(),
  );

describe("Word's recoloured and adjusted picture", () => {
  it.each([
    ['greyscale', '<a:grayscl/>', { recolour: { kind: 'greyscale' } }],
    [
      'a duotone of black and a colour',
      '<a:duotone><a:prstClr val="black"/><a:srgbClr val="4285F4"/></a:duotone>',
      { recolour: { kind: 'duotone', dark: '#000000', light: '#4285f4' } },
    ],
    [
      'brightness and contrast, in thousandths of a percent',
      '<a:lum bright="20500" contrast="-30000"/>',
      { brightness: 20.5, contrast: -30 },
    ],
    ['transparency, as its opacity', '<a:alphaModFix amt="60000"/>', { transparency: 40 }],
    [
      'each, in any order',
      '<a:alphaModFix amt="75000"/><a:lum bright="10000"/><a:grayscl/>',
      { recolour: { kind: 'greyscale' }, transparency: 25, brightness: 10 },
    ],
    [
      'neutral values, as none',
      '<a:lum bright="0" contrast="0"/><a:alphaModFix amt="100000"/>',
      {},
    ],
  ])('is read: %s', async (_, blip, colouring) => {
    const document = await read(wordDocx(wordPicture({ blip })));
    expect(colouringOf(document)).toEqual([colouring]);
  });

  it.each([
    ['in black and white', '<a:biLevel thresh="50000"/>'],
    [
      "in Word's colour variations",
      '<a:duotone><a:schemeClr val="accent1"><a:shade val="45000"/></a:schemeClr><a:prstClr val="white"/></a:duotone>',
    ],
    [
      'in a duotone of a changed colour',
      '<a:duotone><a:srgbClr val="000000"><a:tint val="50000"/></a:srgbClr><a:srgbClr val="FFFFFF"/></a:duotone>',
    ],
    ['in a duotone of one colour', '<a:duotone><a:srgbClr val="000000"/></a:duotone>'],
    [
      'in a duotone of a preset colour',
      '<a:duotone><a:prstClr val="red"/><a:prstClr val="white"/></a:duotone>',
    ],
    [
      'recoloured twice',
      '<a:grayscl/><a:duotone><a:prstClr val="black"/><a:prstClr val="white"/></a:duotone>',
    ],
    ['brightened past its range', '<a:lum bright="150000"/>'],
    ['brightened by a fraction of the step', '<a:lum bright="10.5"/>'],
    ['adjusted twice', '<a:lum bright="10000"/><a:lum contrast="10000"/>'],
    ['more than transparent', '<a:alphaModFix amt="-1"/>'],
    ['tinted', '<a:tint amt="50000"/>'],
  ])('is kept %s', async (_, blip) => {
    const document = await read(wordDocx(wordPicture({ blip })));
    expect(keptNames(document)).toEqual(['drawing']);
  });
});

describe("LibreOffice's recoloured and adjusted picture", () => {
  it.each([
    ['greyscale', { 'draw:color-mode': 'greyscale' }, { recolour: { kind: 'greyscale' } }],
    [
      'a duotone, by the LiveDoc extension',
      { [LIVEDOC_DUOTONE]: '#1A2B3C #4285f4' },
      { recolour: { kind: 'duotone', dark: '#1a2b3c', light: '#4285f4' } },
    ],
    [
      'luminance, contrast and opacity',
      { 'draw:luminance': '20%', 'draw:contrast': '-30.5%', 'draw:image-opacity': '60%' },
      { brightness: 20, contrast: -30.5, transparency: 40 },
    ],
  ])('is read: %s', async (_, changes, colouring) => {
    const document = await read(loOdt(LO_FRAME(), loGraphic(changes)));
    expect(colouringOf(document)).toEqual([{ ...colouring }]);
  });

  it.each([
    ['in black and white', { 'draw:color-mode': 'mono' }],
    ['as a watermark', { 'draw:color-mode': 'watermark' }],
    ['brightened past its range', { 'draw:luminance': '150%' }],
    ['brightened by a length', { 'draw:luminance': '2pt' }],
    ['more than opaque', { 'draw:image-opacity': '101%' }],
    ['tinted red', { 'draw:red': '10%' }],
    ['in a duotone of one colour', { [LIVEDOC_DUOTONE]: '#000000' }],
    [
      'in a duotone and greyscale at once',
      { [LIVEDOC_DUOTONE]: '#000000 #ffffff', 'draw:color-mode': 'greyscale' },
    ],
  ])('is kept %s', async (_, changes) => {
    const document = await read(loOdt(LO_FRAME(), loGraphic(changes)));
    expect(keptNames(document)).toEqual(['frame']);
  });
});

describe('a recoloured and adjusted picture written', () => {
  const document = CONSTRUCTS.pictures!('ooxml');

  it("writes Word's blip effects in the model's order", async () => {
    const pkg = await readOoxmlPackage(new Uint8Array(write(document, 'docx')));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const xml = decoder.decode(pkg.package.parts.get('word/document.xml'));
    expect(xml).toMatch(
      /<a:blip r:embed="rId\d+"><a:duotone><a:srgbClr val="1A2B3C"\/><a:srgbClr val="4285F4"\/><\/a:duotone><a:lum bright="20500" contrast="-30000"\/><a:alphaModFix amt="60000"\/><\/a:blip>/,
    );
    expect(xml).toMatch(/<a:blip r:embed="rId\d+"><a:grayscl\/><\/a:blip>/);
  });

  it("writes the graphic style's luminance, contrast, opacity, colour mode and duotone", async () => {
    const pkg = await readOdfPackage(new Uint8Array(write(CONSTRUCTS.pictures!('odf'), 'odt')));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const content = decoder.decode(pkg.package.entries.get('content.xml'));
    expect(content).toContain(
      'draw:luminance="20.5%" draw:contrast="-30%" draw:image-opacity="60%" xmlns:livedoc="urn:livedoc:xmlns:text:1.0" livedoc:duotone="#1a2b3c #4285f4"',
    );
    expect(content).toContain('draw:color-mode="greyscale"');
  });

  it.each(['docx', 'odt', 'fodt'] as const)('reads back as it was written: %s', async (type) => {
    const format = type === 'docx' ? 'ooxml' : 'odf';
    const original = CONSTRUCTS.pictures!(format);
    expect(colouringOf(await read(write(original, type)))).toEqual(colouringOf(original));
  });

  it('carries them to the other format', async () => {
    const original = CONSTRUCTS.pictures!('odf');
    const converted = convertTextDocument(original, 'ooxml');
    expect(colouringOf(await read(write(converted.document, 'docx')))).toEqual(
      colouringOf(original),
    );
  });
});
