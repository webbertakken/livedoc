// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Editing headers and footers" (Headers and footers options): the
// header and footer margins and the two switches, set for the section or the whole document as one undo step.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import * as Y from 'yjs';
import { liveFirstHeaders, PageSetup, TextDocumentState } from '@livedoc/text-documents';
import {
  applyHeaderOptions,
  headerMarginMost,
  headerOptionsOf,
  withHeaderOptions,
  type HeaderOptions,
} from './text-document-header-options';
import { liveHeadersOf } from './text-document-headers-edit';
import { bodySections } from './pagination/pagination-sections';
import { textDocumentSchema as schema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const A4 = PageSetup.of('a4');
const LETTER = PageSetup.of('letter');
let doc: Y.Doc;
let view: EditorView;

beforeEach(async () => {
  doc = TextDocumentState.load();
  const body = TextDocumentState.body(doc);
  const later = new Y.XmlElement('section_break');
  later.setAttribute('start', 'next-page');
  later.setAttribute('setup', A4 as never);
  later.setAttribute('headers', { differentFirst: true } as never);
  const last = new Y.XmlElement('section_break');
  last.setAttribute('start', 'next-page');
  doc.transact(() => {
    body.delete(0, body.length);
    body.insert(0, [
      new Y.XmlElement('paragraph'),
      later,
      new Y.XmlElement('paragraph'),
      last,
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
const sections = () =>
  bodySections(view.state.doc, TextDocumentState.section(doc, 'odf').setup, liveFirstHeaders(doc));
const options = (over: Partial<HeaderOptions> = {}): HeaderOptions => ({
  header: 36,
  footer: 36,
  differentFirst: false,
  differentOddEven: false,
  ...over,
});

describe('headerOptionsOf', () => {
  it('reads 0.5 in where a section has no margins of its own, and its switches', () => {
    expect(headerOptionsOf(LETTER, undefined)).toEqual(options());
    expect(
      headerOptionsOf(
        { ...LETTER, margins: { ...LETTER.margins, header: 20, footer: 50 } },
        { differentFirst: true, differentOddEven: true },
      ),
    ).toEqual(options({ header: 20, footer: 50, differentFirst: true, differentOddEven: true }));
  });
});

describe('headerMarginMost', () => {
  it('is the shortest page less 1 in, never below 0', () => {
    expect(headerMarginMost([LETTER])).toBe(792 - 72);
    expect(headerMarginMost([LETTER, A4, { ...A4, height: 60 }])).toBe(0);
    expect(headerMarginMost([LETTER, PageSetup.oriented(LETTER, 'landscape')])).toBe(612 - 72);
  });
});

describe('withHeaderOptions', () => {
  it('sets the two margins, the default left absent', () => {
    const set = withHeaderOptions(LETTER, options({ header: 18 }));
    expect(set.margins.header).toBe(18);
    expect(set.margins).not.toHaveProperty('footer');
    const back = withHeaderOptions(set, options());
    expect(back.margins).not.toHaveProperty('header');
    expect(back.margins.top).toBe(LETTER.margins.top);
  });
});

describe('applyHeaderOptions', () => {
  it('sets only the section asked for, its switches its own', () => {
    const changed = applyHeaderOptions(view, doc, 'odf', {
      section: 1,
      scope: 'section',
      options: options({ header: 18, differentFirst: false, differentOddEven: true }),
    });
    expect(changed).toBe(1);
    const now = sections();
    expect(now.setups[1]!.margins.header).toBe(18);
    expect(now.setups[1]!.width).toBe(A4.width);
    expect(now.setups[0]!.margins).not.toHaveProperty('header');
    expect(liveHeadersOf(view, doc, 1)).toEqual({ differentOddEven: true });
    expect(liveHeadersOf(view, doc, 0)).toBeUndefined();
    // The last section followed the second's setup: it keeps the margins it had.
    expect(now.setups[2]).toEqual(A4);
  });

  it('sets the first section in the live state', () => {
    applyHeaderOptions(view, doc, 'odf', {
      section: 0,
      scope: 'section',
      options: options({ footer: 54, differentFirst: true }),
    });
    expect(TextDocumentState.section(doc, 'odf').setup.margins.footer).toBe(54);
    expect(liveFirstHeaders(doc)).toEqual({ differentFirst: true });
    expect(sections().setups[1]!.margins).not.toHaveProperty('footer');
  });

  it('sets every section alike for the whole document, as one undo step', () => {
    const changed = applyHeaderOptions(view, doc, 'odf', {
      section: 1,
      scope: 'document',
      options: options({ header: 10, footer: 12, differentOddEven: true }),
    });
    expect(changed).toBe(3);
    const now = sections();
    for (const setup of now.setups) expect(setup.margins).toMatchObject({ header: 10, footer: 12 });
    expect(now.headers).toEqual([
      { differentOddEven: true },
      { differentOddEven: true },
      { differentOddEven: true },
    ]);
    undo();
    const was = sections();
    expect(was.setups.map((s) => s.margins.header)).toEqual([undefined, undefined, undefined]);
    expect(was.headers).toEqual([undefined, { differentFirst: true }, undefined]);
  });

  it('changes nothing and makes no step when nothing differs', () => {
    const steps = yUndoPluginKey.getState(view.state)!.undoManager.undoStack.length;
    expect(
      applyHeaderOptions(view, doc, 'odf', {
        section: 1,
        scope: 'section',
        options: options({ differentFirst: true }),
      }),
    ).toBe(0);
    expect(yUndoPluginKey.getState(view.state)!.undoManager.undoStack.length).toBe(steps);
  });
});
