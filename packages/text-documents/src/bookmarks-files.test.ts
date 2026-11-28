// docs/specs/034-text-documents/links-and-navigation.md "Bookmarks", standard-mapping.md "The model": a named point is a
// bookmark in either format (ODF `text:bookmark`, OOXML a start its end follows at once), a hidden one (`_…`, a
// heading's id) too; one that spans text stays kept; a new name is 12 lowercase letters and digits, the first a letter; written bookmarks are
// numbered after the kept ones; links to them, the live state and conversion carry them; Google's files read so.
import { readFileSync } from 'node:fs';
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { convertTextDocument } from './convert';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import type { Inline, Paragraph } from './model/blocks';
import { BOOKMARK_NAME_LENGTH, Bookmarks } from './model/bookmarks';
import type { TextDocument } from './model/text-document';
import { CONSTRUCTS } from './testing/constructs';
import { docx, fodt, W_P, W_R } from './testing/packages';
import { TextDocumentState } from './text-document-state';
import { writeLiveDocument } from './live/live-write';

const shape = (inlines: readonly Inline[]) =>
  inlines.map((i) =>
    i.type === 'run'
      ? i.text
      : i.type === 'bookmark'
        ? `#${i.name}`
        : i.type === 'kept'
          ? `[${i.name}]`
          : '?',
  );

async function read(bytes: Uint8Array): Promise<TextDocument> {
  const result = await readTextDocumentFile(bytes);
  if (!result.ok) throw new Error(result.rejection);
  return result.document;
}

const first = async (bytes: Uint8Array) => (await read(bytes)).body[0] as Paragraph;

function written(document: TextDocument, type: 'fodt' | 'odt' | 'docx'): Uint8Array {
  const result = writeTextDocumentFile(document, type);
  return result.bytes;
}

describe('Bookmarks', () => {
  it('holds a name both formats accept, hidden ones too', () => {
    expect(Bookmarks.held('ncjrh2a1zcpq')).toBe(true);
    expect(Bookmarks.held('bookmark=id.ncjrh2a1zcpq')).toBe(true);
    expect(Bookmarks.held('_heading=h.i5swhapfxgy1')).toBe(true);
    expect(Bookmarks.held('_GoBack')).toBe(true);
    expect(Bookmarks.held('_')).toBe(false);
    expect(Bookmarks.held('')).toBe(false);
    expect(Bookmarks.held('two words')).toBe(false);
    expect(Bookmarks.held('a'.repeat(41))).toBe(false);
  });

  it("tells a hidden name, as Word and Google hide a heading's", () => {
    expect(Bookmarks.hidden('_i5swhapfxgy1')).toBe(true);
    expect(Bookmarks.hidden('ncjrh2a1zcpq')).toBe(false);
  });

  it('makes a heading id: _ and a new name, none taken', () => {
    expect(Bookmarks.newHeadingId(new Set())).toMatch(/^_[a-z][a-z0-9]{11}$/);
    let n = 0;
    const random = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5][n++ % 13]!;
    expect(Bookmarks.newHeadingId(new Set(['_aaaaaaaaaaaa']), random)).not.toBe('_aaaaaaaaaaaa');
  });

  it('makes a new name of 12 lowercase letters and digits, the first a letter, none taken', () => {
    const name = Bookmarks.newName(new Set());
    expect(name).toMatch(/^[a-z][a-z0-9]{11}$/);
    expect(BOOKMARK_NAME_LENGTH).toBe(12);
    let n = 0;
    // The first pick repeats a taken name; the next is new.
    const random = () => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5][n++ % 13]!;
    expect(Bookmarks.newName(new Set(['aaaaaaaaaaaa']), random)).not.toBe('aaaaaaaaaaaa');
  });
});

describe('a bookmark in ODF', () => {
  it('is a point of the model, a hidden one too; a spanning one stays kept', async () => {
    const paragraph = await first(
      fodt(
        '<text:p><text:bookmark text:name="bookmark=id.x1"/>Go <text:bookmark text:name="_heading=h.y"/>on <text:bookmark-start text:name="r"/>span<text:bookmark-end text:name="r"/></text:p>',
      ),
    );
    expect(shape(paragraph.inlines)).toEqual([
      '#bookmark=id.x1',
      'Go ',
      '#_heading=h.y',
      'on ',
      '[bookmark-start]',
      'span',
      '[bookmark-end]',
    ]);
  });

  it('lets white space collapse across it, as it shows nothing', async () => {
    const paragraph = await first(fodt('<text:p>a <text:bookmark text:name="b"/> c</text:p>'));
    expect(shape(paragraph.inlines)).toEqual(['a ', '#b', 'c']);
  });
});

describe('a bookmark in OOXML', () => {
  it('is a start its end follows at once, a hidden one too; a spanning one stays kept', async () => {
    const paragraph = await first(
      docx(
        W_P(
          `<w:bookmarkStart w:colFirst="0" w:colLast="0" w:name="ncjrh2a1zcpq" w:id="0"/><w:bookmarkEnd w:id="0"/>${W_R('Go ')}<w:bookmarkStart w:name="_i5" w:id="1"/><w:bookmarkEnd w:id="1"/><w:bookmarkStart w:name="r" w:id="2"/>${W_R('span')}<w:bookmarkEnd w:id="2"/>`,
        ),
      ),
    );
    expect(shape(paragraph.inlines)).toEqual([
      '#ncjrh2a1zcpq',
      'Go ',
      '#_i5',
      '[bookmarkStart]',
      'span',
      '[bookmarkEnd]',
    ]);
  });

  it('numbers the bookmarks written after the kept ones', async () => {
    const document = await read(
      docx(
        W_P(
          `<w:bookmarkStart w:name="new1" w:id="7"/><w:bookmarkEnd w:id="7"/><w:bookmarkStart w:name="_Toc1" w:id="5"/>${W_R('x')}<w:bookmarkEnd w:id="5"/>`,
        ),
      ),
    );
    const pkg = await readOoxmlPackage(new Uint8Array(written(document, 'docx')));
    if (!pkg.ok) throw new Error(pkg.rejection);
    const xml = new TextDecoder().decode(pkg.package.parts.get('word/document.xml'));
    expect(xml).toContain('<w:bookmarkStart w:id="6" w:name="new1"/><w:bookmarkEnd w:id="6"/>');
    expect(xml).toContain('w:name="_Toc1" w:id="5"');
  });
});

describe('bookmarks written and read back', () => {
  for (const type of ['fodt', 'odt', 'docx'] as const) {
    it(`keep their names, places and links in ${type}`, async () => {
      const document = CONSTRUCTS.bookmarks!(type === 'docx' ? 'ooxml' : 'odf');
      const back = await read(written(document, type));
      expect(back.body.map((b) => shape((b as Paragraph).inlines))).toEqual([
        ['#a1b2c3d4e5f6', 'Start here, ', '#mid', 'then on.'],
        ['Back to the ', 'start'],
      ]);
      const link = (back.body[1] as Paragraph).inlines[1];
      expect(link?.type === 'run' && link.link).toBe('#a1b2c3d4e5f6');
    });
  }

  it('carries them through conversion both ways', () => {
    const odf = CONSTRUCTS.bookmarks!('odf');
    const ooxml = convertTextDocument(odf, 'ooxml').document;
    expect(shape((ooxml.body[0] as Paragraph).inlines)[0]).toBe('#a1b2c3d4e5f6');
    expect(
      shape((convertTextDocument(ooxml, 'odf').document.body[0] as Paragraph).inlines)[2],
    ).toBe('#mid');
  });

  it('keeps them in the live state', () => {
    const document = CONSTRUCTS.bookmarks!('odf');
    const doc = new Y.Doc();
    writeLiveDocument(doc, document);
    const back = TextDocumentState.document(doc, 'odf');
    expect(shape((back.body[0] as Paragraph).inlines)).toEqual([
      '#a1b2c3d4e5f6',
      'Start here, ',
      '#mid',
      'then on.',
    ]);
  });
});

describe('Google Docs files', () => {
  const corpus = (name: string) =>
    new Uint8Array(readFileSync(new URL(`../corpus/google/${name}`, import.meta.url)));

  for (const name of ['features-gdocs.odt', 'features-gdocs.docx']) {
    it(`read their bookmark, its link, and their headings’ ids (${name})`, async () => {
      const document = await read(corpus(name));
      const inlines = document.body.flatMap((b) => (b.type === 'paragraph' ? b.inlines : []));
      const bookmarks = inlines.flatMap((i) => (i.type === 'bookmark' ? [i.name] : []));
      const shown = bookmarks.filter((b) => !Bookmarks.hidden(b));
      expect(shown).toHaveLength(1);
      expect(shown[0]).toMatch(/ncjrh2a1zcpq$/);
      expect(inlines.some((i) => i.link === `#${shown[0]}`)).toBe(true);
      // Every heading's id: ODF `_heading=h.<id>`, OOXML `_<id>`.
      expect(bookmarks).toContainEqual(expect.stringMatching(/^_(heading=h\.)?i5swhapfxgy1$/));
      expect(inlines.some((i) => i.type === 'kept' && /^bookmark/.test(i.name))).toBe(false);
    });
  }
});
