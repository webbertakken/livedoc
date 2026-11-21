// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Editing headers and footers": a section's own headers set as a step of
// the body's undo, a new header one empty paragraph under a random id, an empty own one taken away again.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  liveFirstHeaders,
  PageSetup,
  storyFragment,
  TextDocumentState,
} from '@livedoc/text-documents';
import {
  copyStory,
  isStoryEmpty,
  liveHeadersOf,
  makeStory,
  removeIfEmpty,
  setLiveHeaders,
  shownStory,
  withSlot,
  withSwitch,
} from './text-document-headers-edit';
import { textDocumentSchema as schema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';
import { yUndoPluginKey } from 'y-prosemirror';

let doc: Y.Doc;
let view: EditorView;

beforeEach(async () => {
  doc = TextDocumentState.load();
  const body = TextDocumentState.body(doc);
  const paragraph = new Y.XmlElement('paragraph');
  const later = new Y.XmlElement('section_break');
  later.setAttribute('start', 'next-page');
  later.setAttribute('setup', PageSetup.of('a4') as never);
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, [paragraph, later, new Y.XmlElement('paragraph')]);
  });
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(body), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
});

afterEach(() => view.destroy());

const undo = () => yUndoPluginKey.getState(view.state)!.undoManager.undo();

describe('withSlot', () => {
  it('names a story in a slot, keeping the others', () => {
    expect(withSlot({ header: { default: { story: 'a' } } }, 'header', 'first', 'b')).toEqual({
      header: { default: { story: 'a' }, first: { story: 'b' } },
    });
    expect(withSlot(undefined, 'footer', 'default', 'f')).toEqual({
      footer: { default: { story: 'f' } },
    });
  });

  it('takes a slot away, and a kind or the whole when nothing is left', () => {
    const both = { header: { default: { story: 'a' } }, footer: { default: { story: 'f' } } };
    expect(withSlot(both, 'header', 'default', undefined)).toEqual({
      footer: { default: { story: 'f' } },
    });
    expect(
      withSlot({ header: { default: { story: 'a' } } }, 'header', 'default', undefined),
    ).toBeUndefined();
    expect(
      withSlot(
        { header: { default: { story: 'a' } }, differentFirst: true },
        'header',
        'default',
        undefined,
      ),
    ).toEqual({ differentFirst: true });
  });
});

describe('makeStory', () => {
  it('makes one empty paragraph under a new random id ("Which one is edited")', () => {
    const a = makeStory(doc);
    const b = makeStory(doc);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(TextDocumentState.storyParagraphs(doc, a)).toEqual([{ text: '' }]);
    expect(isStoryEmpty(doc, a)).toBe(true);
  });

  it('reads a story with characters as not empty, and one with no paragraph as empty', () => {
    const id = makeStory(doc);
    (storyFragment(doc, id).get(0) as Y.XmlElement).insert(0, [new Y.XmlText('x')]);
    expect(isStoryEmpty(doc, id)).toBe(false);
    expect(isStoryEmpty(doc, 'none')).toBe(true);
  });
});

describe('setLiveHeaders', () => {
  it('sets the first section’s in the document map, undone with the body', () => {
    expect(setLiveHeaders(view, doc, 'odf', 0, { header: { default: { story: 'h' } } })).toBe(true);
    expect(liveFirstHeaders(doc)).toEqual({ header: { default: { story: 'h' } } });
    expect(liveHeadersOf(view, doc, 0)).toEqual({ header: { default: { story: 'h' } } });
    undo();
    expect(liveFirstHeaders(doc)).toBeUndefined();
  });

  it('sets a later section’s on its break, and refuses a section there is none of', () => {
    expect(setLiveHeaders(view, doc, 'odf', 1, { footer: { default: { story: 'f' } } })).toBe(true);
    expect(liveHeadersOf(view, doc, 1)).toEqual({ footer: { default: { story: 'f' } } });
    expect(setLiveHeaders(view, doc, 'odf', 1, undefined)).toBe(true);
    expect(liveHeadersOf(view, doc, 1)).toBeUndefined();
    expect(setLiveHeaders(view, doc, 'odf', 2, undefined)).toBe(false);
    expect(liveHeadersOf(view, doc, 2)).toBeUndefined();
  });
});

describe('removeIfEmpty', () => {
  it('takes an empty own header away, and keeps one with writing or one linked', () => {
    const id = makeStory(doc);
    setLiveHeaders(view, doc, 'odf', 1, { header: { default: { story: id } } });
    const where = { index: 1, kind: 'header' as const, slot: 'default' as const, story: id };
    expect(removeIfEmpty(view, doc, 'odf', where)).toBe(true);
    expect(liveHeadersOf(view, doc, 1)).toBeUndefined();

    const written = makeStory(doc);
    (storyFragment(doc, written).get(0) as Y.XmlElement).insert(0, [new Y.XmlText('x')]);
    setLiveHeaders(view, doc, 'odf', 0, { header: { default: { story: written } } });
    expect(removeIfEmpty(view, doc, 'odf', { ...where, index: 0, story: written })).toBe(false);
    // Section 1 shows section 0's linked: not its own, so it stays.
    expect(removeIfEmpty(view, doc, 'odf', { ...where, story: written })).toBe(false);
  });
});

// "The bar": which header a page shows, read from the live state now; the switches; a copy for unlinking.
describe('shownStory', () => {
  it('reads the page’s slot and its story, own or linked to the previous section’s', () => {
    setLiveHeaders(view, doc, 'odf', 0, {
      header: { default: { story: 'a' }, first: { story: 'f' } },
      differentFirst: true,
    });
    expect(shownStory(doc, 'header', 0, true, 1)).toEqual({
      slot: 'first',
      story: 'f',
      linked: false,
      differentFirst: true,
    });
    expect(shownStory(doc, 'header', 0, false, 2)).toMatchObject({ slot: 'default', story: 'a' });
    // Section 1 has none of its own: the previous section's default, linked; its own switch is off.
    expect(shownStory(doc, 'header', 1, true, 3)).toEqual({
      slot: 'default',
      story: 'a',
      linked: true,
      differentFirst: false,
    });
    expect(shownStory(doc, 'footer', 0, false, 2)).toEqual({
      slot: 'default',
      linked: false,
      differentFirst: true,
    });
  });
});

describe('withSwitch', () => {
  it('switches a section’s own setting on and off, keeping its headers', () => {
    const own = { header: { default: { story: 'a' } } };
    expect(withSwitch(own, 'differentFirst', true)).toEqual({ ...own, differentFirst: true });
    expect(withSwitch({ ...own, differentFirst: true }, 'differentFirst', false)).toEqual(own);
    expect(withSwitch({ differentFirst: true }, 'differentFirst', false)).toBeUndefined();
  });
});

describe('copyStory', () => {
  it('copies a story’s writing under a new id, the copy its own', () => {
    const id = makeStory(doc);
    (storyFragment(doc, id).get(0) as Y.XmlElement).insert(0, [new Y.XmlText('Shared')]);
    const copy = copyStory(doc, id);
    expect(copy).not.toBe(id);
    expect(TextDocumentState.storyParagraphs(doc, copy)).toEqual([{ text: 'Shared' }]);
    (storyFragment(doc, copy).get(0) as Y.XmlElement).insert(0, [new Y.XmlText('Own ')]);
    expect(TextDocumentState.storyParagraphs(doc, id)).toEqual([{ text: 'Shared' }]);
  });
});
