// docs/specs/034-text-documents/files-and-print.md "A PDF imported": each page by its tags where they cover it, else by
// its lines and their boxes; past the cap, pages are cut.
import { describe, expect, it } from 'vitest';
import { PageText, type PagePictures, type PageTags, type PdfEngine } from '@livedoc/pdf-documents';
import { linesOfPageText, pdfImportPages, PDF_IMPORT_MAX_PAGES } from './pdf-import-pages';

// Characters with boxes; a line break the reader adds has an empty box.
function pageOf(lines: readonly [text: string, top: number][], marked?: number[]): PageText {
  const codes: number[] = [];
  const boxes: number[] = [];
  lines.forEach(([text, top], index) => {
    if (index > 0) {
      codes.push(10);
      boxes.push(0, 0, 0, 0);
    }
    [...text].forEach((character, at) => {
      codes.push(character.codePointAt(0)!);
      boxes.push(72 + at * 6, top - 10, 78 + at * 6, top);
    });
  });
  return PageText.of(codes, boxes, marked ? { marked } : {});
}

const toPng = (width: number, height: number) => Promise.resolve(Uint8Array.of(width, height));

const engineOver = (
  pages: readonly {
    text: PageText | null;
    tags: PageTags | null;
    pictures?: PagePictures | null;
  }[],
) =>
  ({
    pageText: (index: number) => Promise.resolve(pages[index]?.text ?? null),
    pageTags: (index: number) => Promise.resolve(pages[index]?.tags ?? null),
    pagePictures: (index: number) => Promise.resolve(pages[index]?.pictures ?? null),
  }) as unknown as PdfEngine;

describe('the pages a PDF import reads', () => {
  it('splits a page at its line breaks, each line boxed by its drawn characters', () => {
    expect(
      linesOfPageText(
        pageOf([
          ['Hi there', 700],
          ['  ', 690],
          ['Next', 680],
        ]),
      ),
    ).toEqual([
      { text: 'Hi there', left: 72, right: 120, top: 700, bottom: 690 },
      { text: 'Next', left: 72, right: 96, top: 680, bottom: 670 },
    ]);
  });

  it('reads tags where they cover a page, else geometry, else nothing', async () => {
    const tagged = pageOf([['Title', 700]], [0, 0, 0, 0, 0]);
    const tags: PageTags = {
      elements: [{ type: 'H1', alt: '', actual: '', lang: '', kids: [0] }],
      cut: false,
    };
    const pages = await pdfImportPages(
      engineOver([
        { text: tagged, tags },
        { text: pageOf([['Plain', 700]]), tags: null },
        { text: null, tags: null },
        { text: { ...pageOf([['  ', 700]]), cut: true }, tags: null },
      ]),
      4,
      toPng,
    );
    expect(pages).toEqual([
      {
        reading: 'tags',
        nodes: [{ type: 'H1', alt: '', kids: ['Title'] }],
        cut: false,
        pictures: [],
        picturesCut: false,
      },
      {
        reading: 'geometry',
        lines: [{ text: 'Plain', left: 72, right: 102, top: 700, bottom: 690 }],
        cut: false,
        pictures: [],
        picturesCut: false,
      },
      { reading: 'none', cut: false, pictures: [], picturesCut: false },
      { reading: 'none', cut: true, pictures: [], picturesCut: false },
    ]);
  });

  it('reads no page past the cap', async () => {
    const pages = await pdfImportPages(engineOver([]), PDF_IMPORT_MAX_PAGES + 1, toPng);
    expect(pages.at(-1)).toEqual({ reading: 'none', cut: true });
  });

  it('hands over each picture where it is drawn: a JPEG as it is, pixels as a PNG, none where unreadable', async () => {
    const box = { left: 72, bottom: 600, right: 172, top: 650 };
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
    const pictures: PagePictures = {
      cut: true,
      pictures: [
        {
          matrix: [1, 0, 0, 1, 0, 0],
          box,
          width: 1,
          height: 1,
          picture: { type: 'image/jpeg', bytes: jpeg },
        },
        {
          matrix: [1, 0, 0, 1, 0, 0],
          box,
          width: 2,
          height: 3,
          picture: { type: 'rgba', width: 2, height: 3, pixels: new Uint8Array(24) },
        },
        { matrix: [1, 0, 0, 1, 0, 0], box, width: 9, height: 9, picture: null },
      ],
    };
    const [page] = await pdfImportPages(
      engineOver([{ text: null, tags: null, pictures }]),
      1,
      toPng,
    );
    expect(page).toEqual({
      reading: 'none',
      cut: false,
      picturesCut: true,
      pictures: [
        { ...box, bytes: jpeg },
        { ...box, bytes: Uint8Array.of(2, 3) },
        { ...box, bytes: null },
      ],
    });
    const failing = () => Promise.reject(new Error('no canvas'));
    const [none] = await pdfImportPages(
      engineOver([{ text: null, tags: null, pictures }]),
      1,
      failing,
    );
    expect(none!.pictures![1]!.bytes).toBeNull();
  });
});
