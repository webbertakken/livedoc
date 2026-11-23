import { beforeAll, describe, expect, it } from 'vitest';
import { PageTags, type TagElement, type TagKid } from '../page-tags';
import { PageText } from '../page-text';
import { corpusBytes, corpusFiles } from '../testing/corpus';
import { readerWasm, taggedPdf, textPdf } from '../testing/fixtures';
import { PdfReader, startReader } from './reader';

// accessibility.md "The accessible tree": the file's tags, the page's marked content, and where they cover it.

let reader: PdfReader;

beforeAll(async () => {
  reader = new PdfReader(await startReader(readerWasm()));
});

const shape = (kid: TagKid): unknown =>
  typeof kid === 'number' ? kid : { [kid.type]: kid.kids.map(shape) };

describe("a page's marked content", () => {
  it('marks each character with its tagged content, an artifact as such, the reader’s own as unmarked', () => {
    reader.open(taggedPdf());
    const page = reader.pageText(0)!;
    const at = (words: string) => page.marked![page.text.indexOf(words)];

    expect(at('Page 1')).toBe(PageText.ARTIFACT);
    expect(at('Annual report')).toBe(0);
    expect(at('ended with')).toBe(1);
    expect(at('Score')).toBe(5);
    expect(page.marked![page.text.indexOf('\r')]).toBe(PageText.UNMARKED);
    expect(reader.pageText(1)!.marked![reader.pageText(1)!.text.indexOf('Words no')]).toBe(
      PageText.UNMARKED,
    );
    reader.close();
  });

  it('holds no marked content for an untagged file', async () => {
    reader.open(await textPdf(1));
    expect(reader.pageText(0)!.marked).toBeNull();
    reader.close();
  });
});

describe("a page's tags", () => {
  it('reads the page’s elements in the tree’s order, with the file’s role map followed', () => {
    reader.open(taggedPdf());
    const tags = reader.pageTags(0)!;

    expect(tags.cut).toBe(false);
    expect(tags.elements.map(shape)).toEqual([
      {
        Document: [
          { H1: [0] },
          { P: [1] },
          { L: [{ LI: [{ Lbl: [2] }, { LBody: [3] }] }] },
          { Table: [{ TR: [{ TH: [4] }, { TH: [5] }] }, { TR: [{ TD: [6] }, { TD: [7] }] }] },
          { Figure: [8] },
        ],
      },
    ]);
    const figure = tags.elements[0]!.kids[4] as TagElement;
    expect(figure).toMatchObject({ alt: 'A red square', actual: '', lang: '' });
    reader.close();
  });

  it('covers the tagged page and reads it, and not the page a line of which no tag reaches', () => {
    reader.open(taggedPdf());
    const first = PageTags.read(reader.pageTags(0), reader.pageText(0));
    const second = PageTags.read(reader.pageTags(1), reader.pageText(1));

    expect(first.source).toBe('tags');
    const [heading, paragraph] = first.source === 'tags' ? first.nodes[0]!.kids : [];
    expect(heading).toMatchObject({ type: 'H1', kids: ['Annual report'] });
    expect(paragraph).toMatchObject({
      type: 'P',
      kids: ['The year began quietly and ended with a record.'],
    });
    expect(second).toEqual({ source: 'geometry', why: 'partial' });
    reader.close();
  });

  it('stops at the limits and says the tags were cut', () => {
    reader.open(taggedPdf());

    expect(reader.pageTags(0, { most: 0 })).toEqual({ elements: [], cut: true });
    expect(reader.pageTags(0, { most: 3 })!.cut).toBe(true);
    expect(reader.pageTags(0, { deepest: 2 })!.cut).toBe(true);
    expect(reader.pageTags(0, { deepest: 4 })!.cut).toBe(false);
    reader.close();
  });

  it('answers none for an untagged page, and nothing for a page that is not there', async () => {
    reader.open(await textPdf(1));
    expect(reader.pageTags(0)).toEqual({ elements: [], cut: false });
    expect(reader.pageTags(3)).toBeNull();
    reader.close();
  });

  it('reads a corpus file’s figure with its alternative text', () => {
    const file = corpusFiles().find(({ file }) => file === 'tagged/tagged_alt_text.pdf')!;
    reader.open(corpusBytes(file));
    const read = PageTags.read(reader.pageTags(0), reader.pageText(0));

    expect(read).toMatchObject({
      source: 'tags',
      nodes: [
        { type: 'Document', kids: [{ type: 'P', kids: [{ type: 'Figure', alt: 'Black Image' }] }] },
      ],
    });
    reader.close();
  });
});
