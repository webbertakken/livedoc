// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { undo, ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  addLiveTab,
  LiveSuggestions,
  TEXT_DOCUMENT_UNDO_GROUP_MS,
  TextDocumentState,
} from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import {
  continueUndoStep,
  startUndoStep,
  TEXT_DOCUMENT_PAGE_ORIGIN,
  TEXT_DOCUMENT_STYLES_ORIGIN,
  TEXT_DOCUMENT_SUGGESTIONS_ORIGIN,
  textDocumentUndoPlugins,
} from './text-document-undo';

// docs/specs/034-text-documents/live-editing-and-storage.md "Undo": typing within 500 ms is one step.
describe('textDocumentUndoPlugins', () => {
  it('groups typing within the span into one step, and not past it', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    // The binding takes the editor over once its first render has run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const undoManager = yUndoPluginKey.getState(view.state)!.undoManager;
    expect(undoManager.captureTimeout).toBe(TEXT_DOCUMENT_UNDO_GROUP_MS);
    const typeAt = (text: string) =>
      view.dispatch(view.state.tr.insertText(text, 1 + view.state.doc.textContent.length));
    typeAt('a');
    typeAt('b');
    // A pause past the span: the last change made that long ago.
    undoManager.lastChange -= TEXT_DOCUMENT_UNDO_GROUP_MS + 1;
    typeAt('c');
    expect(view.state.doc.textContent).toBe('abc');
    undo(view.state);
    expect(view.state.doc.textContent).toBe('ab');
    undo(view.state);
    expect(view.state.doc.textContent).toBe('');
    view.destroy();
  });

  // links-and-navigation.md "Table of contents": Insert, its page numbers read again after the pages are laid out, is
  // one step, though a change kept out of undo (the pages' own drawing) came between.
  it('continues the step being gathered past a change kept out of undo', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const typeAt = (text: string) =>
      view.dispatch(view.state.tr.insertText(text, 1 + view.state.doc.textContent.length));
    typeAt('a');
    startUndoStep(view);
    typeAt('b');
    view.dispatch(view.state.tr.setMeta('addToHistory', false));
    continueUndoStep(view);
    typeAt('c');
    undo(view.state);
    expect(view.state.doc.textContent).toBe('a');
    view.destroy();
  });
});

// docs/specs/034-text-documents/live-editing-and-storage.md "Undo": a change to the styles is on the same timeline.
describe('textDocumentUndoPlugins with the styles', () => {
  it('undoes a styles change made with its origin, with the paragraphs changed beside it, as one step', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    view.dispatch(view.state.tr.insertText('Hello', 1));
    startUndoStep(view);
    const title = TextDocumentState.styles(doc, 'odf').find((s) => s.role === 'title')!;
    TextDocumentState.setStyles(
      doc,
      'odf',
      [{ ...title, text: { size: 40 } }],
      TEXT_DOCUMENT_STYLES_ORIGIN,
    );
    view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { style: title.id }));
    expect(TextDocumentState.stylesType(doc).size).toBeGreaterThan(0);
    undo(view.state);
    expect(TextDocumentState.stylesType(doc).size).toBe(0);
    expect((view.state.doc.firstChild!.attrs as { style: unknown }).style).toBeNull();
    expect(view.state.doc.textContent).toBe('Hello');
    view.destroy();
  });

  it('leaves a styles change made with another origin out of undo', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const title = TextDocumentState.styles(doc, 'odf').find((s) => s.role === 'title')!;
    TextDocumentState.setStyles(doc, 'odf', [{ ...title, text: { size: 40 } }]);
    undo(view.state);
    expect(TextDocumentState.stylesType(doc).size).toBeGreaterThan(0);
    view.destroy();
  });
});

// docs/specs/034-text-documents/editing-surface.md "The ruler": a margin dragged is one undo step.
describe('textDocumentUndoPlugins with the page setup', () => {
  it('undoes a section change made with the page origin', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const section = TextDocumentState.section(doc, 'odf');
    const wider = {
      ...section,
      setup: { ...section.setup, margins: { ...section.setup.margins, left: 36 } },
    };
    TextDocumentState.setSection(doc, wider, TEXT_DOCUMENT_PAGE_ORIGIN);
    expect(TextDocumentState.section(doc, 'odf').setup.margins.left).toBe(36);
    undo(view.state);
    expect(TextDocumentState.section(doc, 'odf').setup.margins.left).toBe(72);
    view.destroy();
  });
});

// review.md "Suggestion cards": Accept and Reject are each one change of the writing, undone with ⌘Z.
describe('textDocumentUndoPlugins with suggestions', () => {
  it('undoes an accept made with its origin as one step', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const author = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
    const insertion = textDocumentSchema.marks.insertion!.create({ id: 's1', at: 1, author });
    view.dispatch(
      view.state.tr
        .insert(1, textDocumentSchema.text('quick', [insertion]))
        .setMeta('addToHistory', false),
    );
    expect(LiveSuggestions.count(doc)).toBe(1);
    expect(LiveSuggestions.accept(doc, 's1', TEXT_DOCUMENT_SUGGESTIONS_ORIGIN)).toBe(true);
    expect(LiveSuggestions.count(doc)).toBe(0);
    undo(view.state);
    expect(LiveSuggestions.count(doc)).toBe(1);
    expect(view.state.doc.textContent).toBe('quick');
    view.destroy();
  });
});

// review.md "Reviewing suggestions": Accept all and Reject all reach every document tab as one change, one ⌘Z takes
// it all back, whichever tab is shown (director, 2026-11-26).
describe('undoing a settle of every suggestion', () => {
  it('takes back every tab’s part with one undo', async () => {
    const doc = TextDocumentState.load();
    addLiveTab(doc, { id: 't.second', name: 'Tab 2', style: 'Standard' });
    const author = { key: 'k', name: 'Ada', colour: '#0284c7' };
    const suggest = (fragment: ReturnType<typeof TextDocumentState.body>, id: string) => {
      const text = new Y.XmlText();
      (fragment.get(0) as Y.XmlElement).insert(0, [text]);
      text.insert(0, 'x', { insertion: { id, at: 1, author } });
    };
    suggest(TextDocumentState.body(doc), 's1');
    suggest(TextDocumentState.tabBody(doc, 't.second'), 's2');
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(LiveSuggestions.settleAll(doc, false, TEXT_DOCUMENT_SUGGESTIONS_ORIGIN)).toBe(2);
    expect(LiveSuggestions.count(doc)).toBe(0);
    undo(view.state);
    expect(LiveSuggestions.read(doc).map((s) => s.id)).toEqual(['s1', 's2']);
    view.destroy();
  });
});
