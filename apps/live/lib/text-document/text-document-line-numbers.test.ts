// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Line numbers" (The panel): each section's line numbers read, and a choice
// applied over the caret's section or the whole document as one step of the body's undo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { PageSetup, TextDocumentState } from '@livedoc/text-documents';
import {
  applyLineNumbers,
  DEFAULT_LINE_NUMBER_RESTART,
  LINE_NUMBERS_SCOPE_LABELS,
  sectionLineNumbers,
  withLineNumbers,
} from './text-document-line-numbers';
import { textDocumentSchema as schema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

let doc: Y.Doc;
let view: EditorView;

const breakWith = (lineNumbers?: unknown) => {
  const element = new Y.XmlElement('section_break');
  element.setAttribute('start', 'next-page');
  element.setAttribute('setup', PageSetup.of('a4') as never);
  if (lineNumbers) element.setAttribute('lineNumbers', lineNumbers as never);
  return element;
};

beforeEach(async () => {
  doc = TextDocumentState.load();
  const body = TextDocumentState.body(doc);
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, [
      new Y.XmlElement('paragraph'),
      breakWith({ restart: 'page', countBy: 5 }),
      new Y.XmlElement('paragraph'),
      breakWith(),
      new Y.XmlElement('paragraph'),
    ]);
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
const read = () => sectionLineNumbers(view, doc, 'odf');

describe('sectionLineNumbers', () => {
  it("reads the first section's from the document and each later one's from its break", () => {
    expect(read()).toEqual([undefined, { restart: 'page', countBy: 5 }, undefined]);
  });
});

describe('withLineNumbers', () => {
  const own = [undefined, { restart: 'page' as const, countBy: 5 }, undefined];

  it('turns every section on with the restart chosen for the whole document', () => {
    expect(
      withLineNumbers(own, { section: 2, scope: 'document', shown: true, restart: 'section' }),
    ).toEqual([{ restart: 'section' }, { restart: 'section', countBy: 5 }, { restart: 'section' }]);
  });

  it('changes only the caret section for This section', () => {
    expect(
      withLineNumbers(own, { section: 1, scope: 'section', shown: false, restart: 'page' }),
    ).toEqual([undefined, undefined, undefined]);
  });

  it('starts at Continue throughout the document', () => {
    expect(DEFAULT_LINE_NUMBER_RESTART).toBe('continuous');
    expect(LINE_NUMBERS_SCOPE_LABELS).toEqual({
      document: 'Entire document',
      section: 'This section',
    });
  });
});

describe('applyLineNumbers', () => {
  it('sets every section as one undo step, the first in the document map', () => {
    expect(
      applyLineNumbers(view, doc, 'odf', {
        section: 0,
        scope: 'document',
        shown: true,
        restart: 'continuous',
      }),
    ).toBe(3);
    expect(TextDocumentState.section(doc, 'odf').lineNumbers).toEqual({ restart: 'continuous' });
    expect(read()).toEqual([
      { restart: 'continuous' },
      { restart: 'continuous', countBy: 5 },
      { restart: 'continuous' },
    ]);
    undo();
    expect(read()).toEqual([undefined, { restart: 'page', countBy: 5 }, undefined]);
  });

  it('turns one later section off and leaves the rest', () => {
    expect(
      applyLineNumbers(view, doc, 'odf', {
        section: 1,
        scope: 'section',
        shown: false,
        restart: 'page',
      }),
    ).toBe(1);
    expect(read()).toEqual([undefined, undefined, undefined]);
  });

  it('makes no step when nothing changes', () => {
    expect(
      applyLineNumbers(view, doc, 'odf', {
        section: 2,
        scope: 'section',
        shown: false,
        restart: 'page',
      }),
    ).toBe(0);
  });
});
