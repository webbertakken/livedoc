// docs/specs/034-text-documents/objects.md "In the file": a drawing's picture names its drawing tab; a file read keeps
// the name only for the text document's own drawing tabs; a download draws each drawing afresh into the file, its
// width kept, its height by the drawing's shape, its crop dropped.
import { mediaKeyOf } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { solidPng } from '../testing/pictures';
import type { Block, Paragraph } from './blocks';
import { DrawingPictures } from './drawing-pictures';
import { Pictures, type Picture } from './pictures';
import { TextDocument } from './text-document';

const picture = (over: Partial<Picture> = {}): Picture => ({
  type: 'picture',
  media: 'old',
  width: 100,
  height: 50,
  props: {},
  ...over,
});
const para = (...inlines: Paragraph['inlines']): Paragraph => ({
  type: 'paragraph',
  style: 'Standard',
  inlines,
  props: {},
});

/** A document holding a picture in its body, a table cell, a note, and its first section's header. */
function documentWith(p: Picture): TextDocument {
  const blank = TextDocument.blank();
  const cell: Block = {
    type: 'table',
    columns: [100],
    headerRows: 0,
    rows: [{ cells: [{ blocks: [para(p)] }] }],
  } as unknown as Block;
  return {
    ...blank,
    body: [para(p), cell, para({ type: 'note', blocks: [para(p)], props: {} } as never)],
    section: { ...blank.section, headers: { header: { default: { blocks: [para(p)] } } } },
    media: { old: { mediaType: 'image/png', bytes: solidPng(2, 1, [0, 0, 0]) } },
  };
}

describe('Pictures.ofDocument', () => {
  it('finds every picture: body, cells, notes and headers', () => {
    expect(Pictures.ofDocument(documentWith(picture({ drawing: 'd1' })))).toHaveLength(4);
  });
});

describe('DrawingPictures.keepOwn', () => {
  it("keeps a name of the text document's own drawing tab, and drops any other", () => {
    const own = DrawingPictures.keepOwn(
      documentWith(picture({ drawing: 'd1' })),
      (id) => id === 'd1',
    );
    expect(Pictures.ofDocument(own).map((p) => p.drawing)).toEqual(['d1', 'd1', 'd1', 'd1']);
    const foreign = DrawingPictures.keepOwn(documentWith(picture({ drawing: 'dx' })), () => false);
    expect(Pictures.ofDocument(foreign).every((p) => !('drawing' in p))).toBe(true);
  });

  it('counts the names a read drops', () => {
    const doc = documentWith(picture({ drawing: 'dx' }));
    expect(DrawingPictures.foreignNames(doc, (id) => id === 'd1')).toBe(4);
    expect(DrawingPictures.foreignNames(doc, (id) => id === 'dx')).toBe(0);
  });

  it('drops an empty name and leaves a document naming none as it is', () => {
    const empty = DrawingPictures.keepOwn(documentWith(picture({ drawing: '' })), () => true);
    expect(Pictures.ofDocument(empty).every((p) => !('drawing' in p))).toBe(true);
    const plain = documentWith(picture());
    expect(DrawingPictures.keepOwn(plain, () => false)).toBe(plain);
  });
});

describe('DrawingPictures.redrawn', () => {
  it('gives each named picture the fresh PNG, its width kept, its height by shape, its crop dropped', async () => {
    const png = solidPng(40, 30, [255, 0, 0]);
    const crop = { top: 0.1, right: 0, bottom: 0, left: 0 };
    const out = await DrawingPictures.redrawn(
      documentWith(picture({ drawing: 'd1', crop })),
      new Map([['d1', png]]),
    );
    const key = await mediaKeyOf(png);
    for (const p of Pictures.ofDocument(out)) {
      expect(p).toMatchObject({ media: key, width: 100, height: 75, drawing: 'd1' });
      expect(p.crop).toBeUndefined();
    }
    expect(out.media?.[key]).toEqual({ mediaType: 'image/png', bytes: png });
  });

  it('leaves a picture whose drawing was not drawn, and skips bytes that are no PNG', async () => {
    const doc = documentWith(picture({ drawing: 'd1' }));
    expect(await DrawingPictures.redrawn(doc, new Map())).toBe(doc);
    const out = await DrawingPictures.redrawn(doc, new Map([['d1', new Uint8Array([1, 2, 3])]]));
    expect(Pictures.ofDocument(out).every((p) => p.media === 'old')).toBe(true);
  });
});
