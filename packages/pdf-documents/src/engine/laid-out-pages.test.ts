import { PDF, type PdfDict, type PdfRef, type PdfStream } from '@libpdf/core';
import { describe, expect, it } from 'vitest';
import { PageTags, type TagNode } from '../page-tags';
import { TINY_JPEG, markFaceFiles, pngOf as encodePng, readerWasm } from '../testing/fixtures';
import { createPdfEngine } from './index';
import {
  LAID_OUT_FIT_RANGE,
  writeLaidOutPages,
  type LaidOutDocument,
  type LaidOutItem,
  type LaidOutPage,
  type LaidOutTag,
} from './laid-out-pages';

const A4 = { width: 595.28, height: 841.89 };
const LORA = {
  id: 'lora',
  files: ['lora/files/lora-latin-400-normal.woff', 'lora/files/lora-latin-ext-400-normal.woff'],
};
const LORA_BOLD_ITALIC = {
  id: 'lora-bi',
  files: ['lora/files/lora-latin-700-italic.woff'],
  bold: true,
};

const word = (
  text: string,
  x: number,
  baseline: number,
  width: number,
  face = 'lora',
): LaidOutItem => ({
  kind: 'text',
  x,
  baseline,
  width,
  text,
  face,
  size: 12,
  colour: '#202124',
});

const documentOf = (
  pages: LaidOutPage[],
  more: Partial<LaidOutDocument> = {},
): LaidOutDocument => ({
  title: 'Quarterly notes',
  created: new Date(Date.UTC(2026, 10, 28, 9)),
  faces: [LORA, LORA_BOLD_ITALIC],
  pages,
  outline: [],
  tags: [],
  ...more,
});

async function written(document: LaidOutDocument) {
  const result = await writeLaidOutPages(document, markFaceFiles);
  if (!result.ok) throw new Error(`refused: ${result.refusal}`);
  return result;
}

async function opened(bytes: Uint8Array<ArrayBuffer>) {
  const engine = await createPdfEngine({ wasm: readerWasm() });
  const open = await engine.open(bytes);
  if (!open.ok) throw new Error('the written file did not open');
  return { engine, pages: open.pages };
}

/** Each page's content, inflated, as the writer wrote it. */
async function contentOf(bytes: Uint8Array, page = 0): Promise<string> {
  const pdf = await PDF.load(bytes);
  const stream = pdf.getPage(page)!.dict.get('Contents', pdf.getObject.bind(pdf)) as PdfStream;
  return new TextDecoder().decode(stream.getDecodedData());
}

const textNodes = (nodes: readonly (TagNode | string)[]): string[] =>
  nodes.flatMap((node) => (typeof node === 'string' ? [node] : textNodes(node.kids)));

describe('writeLaidOutPages', () => {
  it('refuses no pages and a page past the most a PDF page measures', async () => {
    expect(await writeLaidOutPages(documentOf([]), markFaceFiles)).toEqual({
      ok: false,
      refusal: 'no_pages',
    });
    expect(
      await writeLaidOutPages(
        documentOf([{ width: 20_000, height: 100, items: [] }]),
        markFaceFiles,
      ),
    ).toEqual({ ok: false, refusal: 'page_size' });
    expect(
      await writeLaidOutPages(documentOf([{ width: 0, height: 100, items: [] }]), markFaceFiles),
    ).toEqual({ ok: false, refusal: 'page_size' });
  });

  it('writes words as text that reads back in order, with its spaces', async () => {
    const { bytes, missing } = await written(
      documentOf([
        {
          ...A4,
          items: [
            word('Hello ', 72, 100, 30),
            word('world', 106, 100, 32),
            word('Next line', 72, 120, 52),
          ],
        },
      ]),
    );
    expect(missing).toBe(0);
    const { engine } = await opened(bytes);
    const text = await engine.pageText(0);
    expect(text!.text.replace(/\s+/g, ' ').trim()).toBe('Hello world Next line');
    // Where it was drawn: 72 in, its baseline 100 down.
    const left = text!.boxes[0]!;
    expect(Math.abs(left - 72)).toBeLessThan(1.5);
    await engine.close();
  });

  it('embeds each face once, as a subset holding only the glyphs used', async () => {
    const { bytes } = await written(
      documentOf([
        { ...A4, items: [word('abc', 72, 100, 20), word('cab', 72, 120, 20)] },
        { ...A4, items: [word('bca', 72, 100, 20), word('Bold', 72, 140, 30, 'lora-bi')] },
      ]),
    );
    const pdf = await PDF.load(bytes);
    const fonts = new Set<string>();
    for (const page of pdf.getPages()) {
      const resources = page.dict.get('Resources', pdf.getObject.bind(pdf)) as PdfDict;
      const font = resources.get('Font', pdf.getObject.bind(pdf)) as PdfDict;
      for (const [, ref] of font) fonts.add(`${(ref as PdfRef).objectNumber}`);
    }
    expect(fonts.size).toBe(2);
    const { engine } = await opened(bytes);
    expect((await engine.pageText(1))!.text).toContain('Bold');
    await engine.close();
  });

  it('scales a run across to the width it was drawn at, within its range', async () => {
    const { bytes } = await written(
      documentOf([
        { ...A4, items: [word('stretched', 72, 100, 90), word('squashed', 72, 120, 1)] },
      ]),
    );
    const content = await contentOf(bytes);
    const scales = [...content.matchAll(/([\d.]+) Tz/g)].map((match) => Number(match[1]));
    expect(scales[0]).toBeGreaterThan(100);
    expect(scales[1]).toBe(LAID_OUT_FIT_RANGE[0]);
  });

  it('leaves a run that already fits at its own width', async () => {
    const first = await written(documentOf([{ ...A4, items: [word('fit', 72, 100, 14)] }]));
    const scale = Number(/([\d.]+) Tz/.exec(await contentOf(first.bytes))![1]);
    expect(scale).not.toBe(100);
    const drawn = (14 / scale) * 100;
    // Drawn at the width it measures in its own face: no scale.
    const second = await written(documentOf([{ ...A4, items: [word('fit', 72, 100, drawn)] }]));
    expect(await contentOf(second.bytes)).toContain('100 Tz');
  });

  it('sets characters its face lacks in the mark faces, and reads right to left text in order', async () => {
    const { bytes, missing } = await written(
      documentOf([
        {
          ...A4,
          items: [
            word('Ελληνικά', 72, 100, 60),
            {
              kind: 'text',
              x: 72,
              baseline: 140,
              width: 50,
              text: 'שלום',
              face: 'lora',
              size: 12,
              colour: '#000000',
              rtl: true,
            },
          ],
        },
      ]),
    );
    expect(missing).toBe(0);
    const { engine } = await opened(bytes);
    const text = (await engine.pageText(0))!.text;
    expect(text).toContain('Ελληνικά');
    expect(text).toContain('שלום');
    await engine.close();
  });

  it('sets a face whose files do not load in the mark faces, and counts it', async () => {
    const result = await written({
      ...documentOf([{ ...A4, items: [word('Fallback', 72, 100, 50, 'gone')] }]),
      faces: [{ id: 'gone', files: ['gone/files/gone.woff'] }],
    });
    expect(result.facesFailed).toBe(1);
    expect(result.missing).toBe(0);
    const { engine } = await opened(result.bytes);
    expect((await engine.pageText(0))!.text).toContain('Fallback');
    await engine.close();
  });

  it('draws fills, lines and pictures where they were drawn', async () => {
    const png = pngOf(4, 4, [255, 0, 0, 255]);
    const { bytes } = await written(
      documentOf([
        {
          ...A4,
          items: [
            { kind: 'box', x: 0, y: 0, width: A4.width, height: A4.height, colour: '#0000ff' },
            {
              kind: 'line',
              x1: 72,
              y1: 200,
              x2: 300,
              y2: 200,
              width: 1,
              colour: '#00ff00',
              dash: 'dashed',
            },
            {
              kind: 'picture',
              x: 100,
              y: 300,
              width: 100,
              height: 100,
              bytes: png,
              format: 'png',
              opacity: 0.5,
            },
          ],
        },
      ]),
    );
    const content = await contentOf(bytes);
    expect(content).toMatch(/re f/);
    expect(content).toMatch(/\] 0 d/);
    expect(content).toMatch(/\/Im0 Do/);
    expect(content).toMatch(/\/GS500 gs/);
    const { engine } = await opened(bytes);
    const drawn = await engine.drawPage(0, 1);
    // The picture's middle, half red over the blue page.
    const at = (350 * drawn!.width + 150) * 4;
    expect(drawn!.rgba[at]).toBeGreaterThan(100);
    expect(drawn!.rgba[at + 2]).toBeGreaterThan(100);
    await engine.close();
  });

  it('links to the web, mail and places in the pages, and leaves out any other', async () => {
    const result = await written(
      documentOf([
        {
          ...A4,
          items: [
            { kind: 'link', x: 72, y: 90, width: 50, height: 14, to: { uri: 'https://docs.nu/' } },
            {
              kind: 'link',
              x: 72,
              y: 110,
              width: 50,
              height: 14,
              to: { uri: 'mailto:ada@example.com' },
            },
            {
              kind: 'link',
              x: 72,
              y: 130,
              width: 50,
              height: 14,
              to: { uri: 'javascript:alert(1)' },
            },
            { kind: 'link', x: 72, y: 150, width: 50, height: 14, to: { page: 1, top: 72 } },
          ],
        },
        { ...A4, items: [] },
      ]),
    );
    expect(result.droppedLinks).toBe(1);
    const { engine, pages } = await opened(result.bytes);
    const links = await engine.links(0);
    expect(links.map((link) => link.target)).toEqual([
      { kind: 'address', address: 'https://docs.nu/' },
      { kind: 'address', address: 'mailto:ada@example.com' },
      expect.objectContaining({ kind: 'place', page: pages[1]!.name }),
    ]);
    expect(links[0]!.rect[1]).toBeCloseTo(841.89 - 104, 0);
    await engine.close();
  });

  it('writes the outline from the headings, nested by level', async () => {
    const { bytes } = await written(
      documentOf(
        [
          { ...A4, items: [] },
          { ...A4, items: [] },
        ],
        {
          outline: [
            { title: 'Introduction', level: 1, page: 0, top: 72 },
            { title: 'Scope', level: 2, page: 0, top: 200 },
            { title: 'Detail', level: 3, page: 1, top: 72 },
            { title: 'Results', level: 1, page: 1, top: 400 },
          ],
        },
      ),
    );
    const { engine, pages } = await opened(bytes);
    const outline = await engine.outline();
    expect(outline.items.map(({ title, depth }) => [title, depth])).toEqual([
      ['Introduction', 0],
      ['Scope', 1],
      ['Detail', 2],
      ['Results', 0],
    ]);
    expect(outline.items[2]!.target).toEqual(
      expect.objectContaining({ kind: 'place', page: pages[1]!.name }),
    );
    await engine.close();
  });

  it('writes no outline without headings', async () => {
    const { bytes } = await written(documentOf([{ ...A4, items: [] }]));
    const { engine } = await opened(bytes);
    expect((await engine.outline()).items).toEqual([]);
    await engine.close();
  });

  it('tags what it names and marks everything else as an artifact', async () => {
    const page: LaidOutPage = {
      ...A4,
      items: [
        word('Title', 72, 80, 40),
        word('A paragraph.', 72, 110, 70),
        word('•', 72, 130, 5),
        word('Item', 90, 130, 25),
        word('3', 300, 820, 6),
        {
          kind: 'picture',
          x: 72,
          y: 150,
          width: 20,
          height: 20,
          bytes: pngOf(1, 1, [0, 0, 0, 255]),
          format: 'png',
        },
        word('Docs', 72, 200, 30),
        { kind: 'link', x: 72, y: 190, width: 30, height: 12, to: { uri: 'https://docs.nu/' } },
      ],
    };
    const tags: LaidOutTag[] = [
      { role: 'H1', kids: [{ item: [0, 0] }] },
      { role: 'P', kids: [{ item: [0, 1] }] },
      {
        role: 'L',
        kids: [
          {
            role: 'LI',
            kids: [
              { role: 'Lbl', kids: [{ item: [0, 2] }] },
              { role: 'LBody', kids: [{ item: [0, 3] }] },
            ],
          },
        ],
      },
      { role: 'Figure', alt: 'A black square', kids: [{ item: [0, 5] }] },
      { role: 'P', kids: [{ role: 'Link', kids: [{ item: [0, 6] }, { item: [0, 7] }] }] },
    ];
    const { bytes } = await written(documentOf([page], { tags }));
    const content = await contentOf(bytes);
    expect(content).toContain('/H1 <</MCID 0>> BDC');
    expect(content).toContain('/Artifact BMC');
    const { engine } = await opened(bytes);
    const read = PageTags.read(await engine.pageTags(0), await engine.pageText(0));
    expect(read.source).toBe('tags');
    if (read.source !== 'tags') return;
    const types = (nodes: readonly (TagNode | string)[]): string[] =>
      nodes.flatMap((node) => (typeof node === 'string' ? [] : [node.type, ...types(node.kids)]));
    expect(types(read.nodes)).toEqual(
      expect.arrayContaining(['Document', 'H1', 'P', 'L', 'LI', 'Lbl', 'LBody', 'Figure', 'Link']),
    );
    expect(textNodes(read.nodes)).toEqual(['Title', 'A paragraph.', '•', 'Item', 'Docs']);
    const figure = JSON.stringify(read.nodes);
    expect(figure).toContain('A black square');
    // The page number is no one's words: an artifact.
    expect(textNodes(read.nodes)).not.toContain('3');
    const pdf = await PDF.load(bytes);
    const catalog = pdf.getCatalog();
    expect(catalog.has('StructTreeRoot')).toBe(true);
    expect(catalog.has('MarkInfo')).toBe(true);
    await engine.close();
  });

  it('says its title, language and maker, and no author', async () => {
    const { bytes } = await written(documentOf([{ ...A4, items: [] }], { language: 'nl' }));
    const pdf = await PDF.load(bytes);
    expect(pdf.getTitle()).toBe('Quarterly notes');
    expect(pdf.getProducer()).toBe('LiveDoc');
    expect(pdf.getCreator()).toBe('LiveDoc');
    expect(pdf.getAuthor() ?? '').toBe('');
    expect(pdf.getLanguage()).toBe('nl');
  });

  it('draws dotted and solid lines, a see-through fill and a JPEG as it came', async () => {
    const { bytes } = await written(
      documentOf([
        {
          ...A4,
          items: [
            {
              kind: 'line',
              x1: 72,
              y1: 200,
              x2: 300,
              y2: 200,
              width: 1,
              colour: '#000000',
              dash: 'dotted',
            },
            { kind: 'line', x1: 72, y1: 220, x2: 300, y2: 220, width: 1, colour: '#000000' },
            { kind: 'box', x: 72, y: 240, width: 50, height: 10, colour: '#ffff00', opacity: 0.4 },
            { kind: 'box', x: 72, y: 260, width: 50, height: 10, colour: '#ffff00', opacity: 0.4 },
            {
              kind: 'picture',
              x: 72,
              y: 300,
              width: 40,
              height: 20,
              bytes: TINY_JPEG,
              format: 'jpeg',
            },
          ],
        },
      ]),
    );
    const content = await contentOf(bytes);
    expect(content).toContain('1 J [0 2] 0 d');
    expect(content).toContain('[] 0 d');
    expect(content.match(/\/GS400 gs/g)).toHaveLength(2);
    const pdf = await PDF.load(bytes);
    expect(new TextDecoder('latin1').decode(bytes)).toContain('/DCTDecode');
    expect(pdf.getPageCount()).toBe(1);
  });

  it('sets a face it was never told of in the mark faces', async () => {
    const { bytes, missing } = await written(
      documentOf([{ ...A4, items: [word('Unknown', 72, 100, 50, 'nobody')] }]),
    );
    expect(missing).toBe(0);
    const { engine } = await opened(bytes);
    expect((await engine.pageText(0))!.text).toContain('Unknown');
    await engine.close();
  });

  it('refuses when a face it read cannot be loaded to shape', async () => {
    let reads = 0;
    const once = async (file: string) => {
      reads += 1;
      if (reads > 1) throw new Error('gone');
      return markFaceFiles(file);
    };
    const result = await writeLaidOutPages(
      {
        ...documentOf([{ ...A4, items: [word('Once', 72, 100, 30)] }]),
        faces: [{ id: 'lora', files: [LORA.files[0]!] }],
      },
      once,
    );
    expect(result).toEqual({ ok: false, refusal: 'face' });
  });

  it('leaves out a link and a heading to a page that is not there, and tags only what is drawn', async () => {
    const result = await written(
      documentOf(
        [
          {
            ...A4,
            items: [
              word('Here', 72, 100, 30),
              { kind: 'link', x: 72, y: 90, width: 30, height: 12, to: { page: 4, top: 0 } },
            ],
          },
        ],
        {
          outline: [{ title: 'Nowhere', level: 1, page: 3, top: 0 }],
          tags: [
            {
              role: 'P',
              lang: 'nl',
              kids: [
                { role: 'Link', kids: [{ item: [0, 0] }, { item: [0, 1] }] },
                { item: [5, 0] },
                { item: [0, 0] },
              ],
            },
          ],
        },
      ),
    );
    expect(result.droppedLinks).toBe(1);
    const { engine } = await opened(result.bytes);
    expect((await engine.outline()).items).toEqual([]);
    const read = PageTags.read(await engine.pageTags(0), await engine.pageText(0));
    expect(JSON.stringify(read)).toContain('Here');
    await engine.close();
  });
});

/** A PNG of one colour, written with the browser-free encoder the fixtures use. */
function pngOf(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number],
): Uint8Array {
  return encodePng(width, height, rgba);
}
