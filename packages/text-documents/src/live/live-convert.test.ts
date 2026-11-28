// docs/specs/034-text-documents/standard-mapping.md "Conversion": the live state made to read as the converted document
// by the least change, in one transaction, one undo taking it all back; comment threads untouched.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { convertTextDocument } from '../convert';
import { readTextDocumentFile } from '../files';
import type { Paragraph } from '../model/blocks';
import type { TextDocument, TextDocumentFormat } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { TextDocumentState } from '../text-document-state';
import { convertLive, makeLiveReadAs, sameValue } from './live-convert';
import { DOCUMENT_MAP, FOOTNOTE, SECTION_BREAK, THREADS_MAP } from './live-names';
import { tabFragment } from './live-root';
import { liveStoryIds, storyFragment } from './live-stories';
import { liveTabIds } from './live-tabs';
import { canonical, syncWriting } from './writing-sync';

const CORPUS = join(import.meta.dirname, '..', '..', 'corpus');
const corpus = ['libreoffice', 'word', 'google'].flatMap((maker) =>
  readdirSync(join(CORPUS, maker))
    .filter(
      (f) =>
        /\.(odt|fodt|docx)$/.test(f) && !f.startsWith('encrypted') && !f.endsWith('-source.fodt'),
    )
    .map((f) => join(maker, f)),
);

const other = (format: TextDocumentFormat): TextDocumentFormat =>
  format === 'odf' ? 'ooxml' : 'odf';

async function read(file: string): Promise<TextDocument> {
  const result = await readTextDocumentFile(readFileSync(join(CORPUS, file)));
  if (!result.ok) throw new Error(result.rejection);
  return result.document;
}

const live = (document: TextDocument) =>
  TextDocumentState.load([TextDocumentState.fromDocument(document)]);

/** The document as a live state holds it, comparable. */
const held = (doc: Y.Doc, format: TextDocumentFormat) =>
  canonical(TextDocumentState.document(doc, format));

/** How many updates a change writes to the doc. */
function updatesOf(doc: Y.Doc, change: () => void): number {
  let count = 0;
  const counted = () => (count += 1);
  doc.on('update', counted);
  change();
  doc.off('update', counted);
  return count;
}

/** Gives every story a new id, as stories made in the editor have: the ids a written document would not choose. */
function withEditorStoryIds(doc: Y.Doc): Y.Doc {
  const ids = new Map(liveStoryIds(doc).map((id) => [id, `edited-${id}`]));
  const rename = (headers: Record<string, Record<string, { story: string }>> | undefined) =>
    headers &&
    Object.fromEntries(
      Object.entries(headers).map(([kind, set]) => [
        kind,
        typeof set === 'object' && set
          ? Object.fromEntries(
              Object.entries(set).map(([slot, s]) => [slot, { ...s, story: ids.get(s.story) }]),
            )
          : set,
      ]),
    );
  doc.transact(() => {
    for (const [id, renamed] of ids) {
      syncWriting(storyFragment(doc, id), storyFragment(doc, renamed));
      storyFragment(doc, id).delete(0, storyFragment(doc, id).length);
    }
    const meta = doc.getMap<unknown>(DOCUMENT_MAP);
    const section = meta.get('section') as { headers?: never } | undefined;
    if (section?.headers) meta.set('section', { ...section, headers: rename(section.headers) });
    for (const tab of liveTabIds(doc)) {
      const walk = (parent: Y.XmlFragment | Y.XmlElement) => {
        for (const node of parent.toArray())
          if (node instanceof Y.XmlElement) {
            if (node.nodeName === SECTION_BREAK && node.getAttribute('headers'))
              node.setAttribute(
                'headers',
                rename(node.getAttribute('headers') as never) as unknown as string,
              );
            if (node.nodeName === FOOTNOTE)
              node.setAttribute('story', ids.get(node.getAttribute('story') as string)!);
            walk(node);
          }
      };
      walk(tabFragment(doc, tab));
    }
  });
  return doc;
}

describe('convertLive', () => {
  // One test a file: the corpus whole runs past a test's time under coverage.
  it.each(corpus)('writes nothing converting %s to the format it is in', async (file) => {
    const document = await read(file);
    const doc = live(document);
    expect(updatesOf(doc, () => convertLive(doc, document.format, document.format))).toBe(0);
  });

  it('keeps the stories made in the editor under their own ids, writing nothing when nothing changes', () => {
    for (const name of ['headers', 'footnotes']) {
      const doc = withEditorStoryIds(live(CONSTRUCTS[name]!('odf')));
      const before = liveStoryIds(doc);
      expect(before.every((id) => id.startsWith('edited-'))).toBe(true);
      expect(
        updatesOf(doc, () => convertLive(doc, 'odf', 'odf')),
        name,
      ).toBe(0);
      expect(liveStoryIds(doc)).toEqual(before);
    }
  });

  it.each(corpus)('makes the live state read as %s converted, either way', async (file) => {
    const document = await read(file);
    const to = other(document.format);
    const doc = live(document);
    const losses = convertLive(doc, document.format, to);
    const converted = convertTextDocument(document, to);
    expect(losses).toEqual(converted.losses);
    expect(held(doc, to)).toBe(held(live(converted.document), to));
  });

  it('converts headers and notes made in the editor in place, under their own ids', () => {
    for (const name of ['headers', 'footnotes']) {
      const doc = withEditorStoryIds(live(CONSTRUCTS[name]!('odf')));
      const before = liveStoryIds(doc);
      convertLive(doc, 'odf', 'ooxml');
      expect(liveStoryIds(doc), name).toEqual(before);
      const converted = convertTextDocument(CONSTRUCTS[name]!('odf'), 'ooxml').document;
      expect(held(doc, 'ooxml'), name).toBe(held(live(converted), 'ooxml'));
    }
  });

  it('is one transaction under the origin, and one undo puts everything back', async () => {
    const document = await read('libreoffice/features.odt');
    const doc = live(document);
    const before = canonical(TextDocumentState.document(doc, 'odf'));
    const origin = Symbol('conversion');
    const undo = new Y.UndoManager(
      [...doc.share.keys()]
        .filter((name) => name !== THREADS_MAP)
        .map((name) =>
          name.startsWith('story:') || name === 'body' || name.startsWith('tab:')
            ? doc.getXmlFragment(name)
            : doc.getMap(name),
        ),
      { trackedOrigins: new Set([origin]) },
    );
    expect(updatesOf(doc, () => convertLive(doc, 'odf', 'ooxml', origin))).toBe(1);
    expect(canonical(TextDocumentState.document(doc, 'odf'))).not.toBe(before);
    expect(undo.undoStack).toHaveLength(1);
    undo.undo();
    expect(canonical(TextDocumentState.document(doc, 'odf'))).toBe(before);
  });

  it('gives a story with no live place a new id, never one a live fragment holds', () => {
    const liveDoc = live(CONSTRUCTS.blank!('odf'));
    storyFragment(liveDoc, 'converted-1').insert(0, [new Y.XmlText('orphan')]);
    const scratch = live(CONSTRUCTS.footnotes!('odf'));
    expect(liveStoryIds(scratch)).toEqual(['1', '2']);
    makeLiveReadAs(liveDoc, scratch);
    expect(liveStoryIds(liveDoc)).toEqual(['converted-1-', 'converted-2']);
    expect(held(liveDoc, 'odf')).toBe(held(live(CONSTRUCTS.footnotes!('odf')), 'odf'));
    expect(storyFragment(liveDoc, 'converted-1').toJSON()).toBe('orphan');
  });

  it('empties a live story the scratch has no place for', () => {
    const liveDoc = live(CONSTRUCTS.footnotes!('odf'));
    const [first, second] = liveStoryIds(liveDoc);
    const oneNote = CONSTRUCTS.footnotes!('odf');
    const paragraph = oneNote.body[0] as Paragraph;
    const scratch = live({
      ...oneNote,
      body: [{ ...paragraph, inlines: paragraph.inlines.filter((_, i) => i !== 3) }],
    });
    makeLiveReadAs(liveDoc, scratch);
    expect(liveStoryIds(liveDoc)).toEqual([first]);
    expect(storyFragment(liveDoc, second!).length).toBe(0);
  });

  it('leaves the comment threads as they are', async () => {
    const document = await read('libreoffice/features.odt');
    const doc = live(document);
    const threads = canonical(doc.getMap(THREADS_MAP).toJSON());
    expect(doc.getMap(THREADS_MAP).size).toBeGreaterThan(0);
    convertLive(doc, document.format, other(document.format));
    expect(canonical(doc.getMap(THREADS_MAP).toJSON())).toBe(threads);
  });

  // Kept fonts run to megabytes: they are compared as bytes, never as JSON.
  it('compares kept bytes as bytes, and every other value by its content', () => {
    expect(sameValue(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameValue(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameValue(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
    expect(sameValue(new Uint8Array([1]), [1])).toBe(false);
    expect(
      sameValue({ a: [1, { b: new Uint8Array([9]) }] }, { a: [1, { b: new Uint8Array([9]) }] }),
    ).toBe(true);
    expect(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameValue({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameValue([1, 2], [1])).toBe(false);
    expect(sameValue('x', 'x')).toBe(true);
    expect(sameValue(undefined, null)).toBe(false);
  });
});
