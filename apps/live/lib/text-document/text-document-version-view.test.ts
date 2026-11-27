// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Version history": a version is drawn read only with what it changed in each
// editor's colour, and drawing it never changes the document it is drawn from (the y-prosemirror hazard: a node it
// cannot draw is deleted from Yjs, blueprint "12g2 research").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, ySyncPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { readTextDocumentFile, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { openVersionView, tabHeldAt, type VersionView } from './text-document-version-view';
import { versionAuthorship } from './text-document-version-authorship';

const CORPUS = join(import.meta.dirname, '../../../../packages/text-documents/corpus');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A document read from a corpus file, then changed: blocks of every kind taken away, writing added. */
async function changedDocument(file: string) {
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(join(CORPUS, file))));
  if (!read.ok) throw new Error(file);
  const doc = TextDocumentState.load([TextDocumentState.fromDocument(read.document)]);
  doc.clientID = 11;
  const before = Y.snapshot(doc);
  const body = TextDocumentState.body(doc);
  const writer = new Y.Doc({ gc: false });
  writer.clientID = 22;
  Y.applyUpdate(writer, Y.encodeStateAsUpdate(doc));
  const theirs = TextDocumentState.body(writer);
  // Every second block taken away by one editor, a paragraph added by another.
  doc.transact(() => {
    for (let i = body.length - 1; i >= 0; i -= 2) body.delete(i, 1);
  });
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText('Added later')]);
  theirs.insert(0, [paragraph]);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(writer, Y.encodeStateVector(doc)));
  return { doc, before, after: Y.snapshot(doc) };
}

const views: VersionView[] = [];
afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
});

const authorship = versionAuthorship({
  clients: {
    '11': { key: 'k-ada', name: 'Ada', color: '#0284c7' },
    '22': { key: 'k-bo', name: 'Bo', color: '#c2410c' },
  },
  deletedBy: {},
});

describe('openVersionView', () => {
  it.each([
    'libreoffice/features.odt',
    'libreoffice/rich.docx',
    'word/VariousPictures.docx',
    'word/bookmarks.docx',
    'libreoffice/features.docx',
  ])('draws %s at a version with its changes and leaves its state as it was', async (file) => {
    const { doc, before, after } = await changedDocument(file);
    const state = Y.encodeStateAsUpdate(doc);
    const version = openVersionView(document.createElement('div'), {
      state,
      tab: 't.0',
      nodeViews: () => ({}),
      attributes: () => ({}),
    });
    views.push(version);
    const copy = version.doc;
    const xml = TextDocumentState.body(copy).toJSON();
    const snapshot = Y.snapshot(copy);
    version.show({ snapshot: after, previous: before, authorship, showChanges: true });
    await tick();
    await tick();
    expect(Y.equalSnapshots(Y.snapshot(copy), snapshot)).toBe(true);
    expect(TextDocumentState.body(copy).toJSON()).toBe(xml);
    const drawn = version.view.dom;
    expect(drawn.querySelector('[data-ychange="added"]')?.textContent).toBe('Added later');
    expect(drawn.querySelectorAll('[data-ychange="removed"]').length).toBeGreaterThan(0);
    expect(drawn.getAttribute('aria-readonly')).toBe('true');
    expect(version.view.editable).toBe(false);
  });

  it('draws the version alone with changes off', async () => {
    const { doc, before, after } = await changedDocument('libreoffice/features.odt');
    const version = openVersionView(document.createElement('div'), {
      state: Y.encodeStateAsUpdate(doc),
      tab: 't.0',
      nodeViews: () => ({}),
      attributes: () => ({ 'aria-label': 'Version' }),
    });
    views.push(version);
    version.show({ snapshot: after, previous: before, authorship, showChanges: false });
    await tick();
    expect(version.view.dom.querySelector('[data-ychange]')).toBeNull();
    expect(version.view.dom.textContent).toContain('Added later');
    // At the earlier version, the writing added since is not there.
    version.show({ snapshot: before, previous: before, authorship, showChanges: false });
    await tick();
    expect(version.view.dom.textContent).not.toContain('Added later');
    expect(version.view.dom.getAttribute('aria-label')).toBe('Version');
  });

  // The hazard the version schema guards against: the editor's own schema has no `ychange` mark, so y-prosemirror
  // takes the text it cannot draw out of the document.
  it('would lose writing drawn with the editor’s own schema', async () => {
    const { doc, before, after } = await changedDocument('libreoffice/features.odt');
    const snapshot = Y.snapshot(doc);
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc))],
      }),
    });
    view.dispatch(
      view.state.tr.setMeta(ySyncPluginKey, {
        snapshot: after,
        prevSnapshot: before,
        permanentUserData: authorship.permanentUserData,
        colorMapping: authorship.colorMapping,
        colors: authorship.colors,
      }),
    );
    await tick();
    expect(Y.equalSnapshots(Y.snapshot(doc), snapshot)).toBe(false);
    view.destroy();
  });
});

describe('tabHeldAt', () => {
  it('says whether a document tab held anything at a version', () => {
    const doc = new Y.Doc({ gc: false });
    const empty = Y.snapshot(doc);
    const paragraph = new Y.XmlElement('paragraph');
    TextDocumentState.tabBody(doc, 't.2').insert(0, [paragraph]);
    expect(tabHeldAt(doc, 't.2', empty)).toBe(false);
    expect(tabHeldAt(doc, 't.2', Y.snapshot(doc))).toBe(true);
  });
});
