// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles": applying a style, the style at the caret,
// the Styles control and Format > Paragraph styles.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument, type Style } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  PARAGRAPH_STYLE_ITEMS,
  paragraphStyleNameOf,
  setParagraphStyle,
  textDocumentParagraphStyleActions,
} from './text-document-paragraph-styles';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const blank = TextDocument.blank({ format: 'odf' });
const idOf = (role: Style['role']) => blank.styles.find((s) => s.role === role)!.id;
const p = (text: string, style: string | null = null) =>
  schema.nodes.paragraph!.create({ style }, text ? schema.text(text) : undefined);

let view: EditorView;
let styles: readonly Style[];
const readFormatting = () => ({ styles, defaults: blank.defaults });
const addStyle = vi.fn((style: Style) => {
  styles = [...styles, style];
});

function open(paragraphs: ReturnType<typeof p>[], from: number, to = from) {
  const doc = schema.node('doc', null, paragraphs);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, from, to) }),
  });
}

const stylesOfParagraphs = () => {
  const out: unknown[] = [];
  view.state.doc.forEach((node) => out.push((node.attrs as { style: unknown }).style));
  return out;
};

beforeEach(() => {
  styles = blank.styles;
  addStyle.mockClear();
  vi.mocked(track).mockClear();
});
afterEach(() => view?.destroy());

describe('PARAGRAPH_STYLE_ITEMS', () => {
  it('lists the nine styles with Format > Paragraph styles item ids and their shortcut arguments', () => {
    expect(PARAGRAPH_STYLE_ITEMS.map((s) => [s.item, s.label, s.shortcutArg])).toEqual([
      ['style-normal', 'Normal text', undefined],
      ['style-title', 'Title', undefined],
      ['style-subtitle', 'Subtitle', undefined],
      ...[1, 2, 3, 4, 5, 6].map((n) => [`style-heading-${n}`, `Heading ${n}`, String(n)]),
    ]);
  });
});

describe('setParagraphStyle and paragraphStyleNameOf', () => {
  it('sets every paragraph the selection touches, as one step, Normal text as no style', () => {
    open([p('one'), p('two'), p('three')], 2, 8);
    setParagraphStyle(idOf('heading1'))(view.state, view.dispatch);
    expect(stylesOfParagraphs()).toEqual([idOf('heading1'), idOf('heading1'), null]);
    expect(paragraphStyleNameOf(view.state, styles)).toBe('Heading 1');
    setParagraphStyle(null)(view.state, view.dispatch);
    expect(stylesOfParagraphs()).toEqual([null, null, null]);
  });

  it('names Normal text for no style or one the document lacks, a style by its name, and null when mixed', () => {
    open([p('a', 'Missing'), p('b', idOf('title')), p('c', 'Quote')], 1);
    expect(paragraphStyleNameOf(view.state, styles)).toBe('Normal text');
    const quote: Style = {
      id: 'Quote',
      name: 'Quote',
      family: 'paragraph',
      paragraph: {},
      text: {},
    };
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)));
    expect(paragraphStyleNameOf(view.state, [...styles, quote])).toBe('Quote');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
    expect(paragraphStyleNameOf(view.state, styles)).toBeNull();
  });
});

describe('textDocumentParagraphStyleActions', () => {
  it('binds nothing without an editor, or for a session that does not write', () => {
    expect(
      textDocumentParagraphStyleActions(null, readFormatting, addStyle, 'odf', { canEdit: true }),
    ).toEqual({
      actions: {},
      choices: null,
    });
    open([p('a')], 1);
    expect(
      textDocumentParagraphStyleActions(view, readFormatting, addStyle, 'odf', { canEdit: false })
        .choices,
    ).toBeNull();
  });

  it('applies a style from an item, checks the one at the caret, focuses the writing and counts it', () => {
    open([p('a')], 1);
    const { actions, choices } = textDocumentParagraphStyleActions(
      view,
      readFormatting,
      addStyle,
      'odf',
      {
        canEdit: true,
      },
    );
    expect(actions['style-normal']!.checked).toBe(true);
    actions['style-heading-2']!.run();
    expect(stylesOfParagraphs()).toEqual([idOf('heading2')]);
    expect(actions['style-heading-2']!.checked).toBe(true);
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentParagraphStyle');
    const styleChoice = choices!.styles!;
    expect(styleChoice.read()).toBe('Heading 2');
    expect(styleChoice.actions).toBe(actions);
    expect(addStyle).not.toHaveBeenCalled();
  });

  it('draws each style in its look in the Styles menu, Options dimmed for now', () => {
    open([p('a')], 1);
    const { choices } = textDocumentParagraphStyleActions(view, readFormatting, addStyle, 'odf', {
      canEdit: true,
    });
    const entries = choices!.styles!.entries;
    const title = entries.find((e) => e.kind === 'item' && e.id === 'style-title');
    expect(title).toMatchObject({ checkable: 'radio', faceStyle: { fontSize: '22px' } });
    const h6 = entries.find((e) => e.kind === 'item' && e.id === 'style-heading-6');
    expect(h6).toMatchObject({ faceStyle: { fontSize: '14.7px', fontStyle: 'italic' } });
    expect(entries.at(-1)).toMatchObject({ kind: 'submenu', label: 'Options' });
  });

  it('adds a style the document lacks before applying it', () => {
    styles = blank.styles.filter((s) => s.role !== 'title');
    open([p('a')], 1);
    const { actions } = textDocumentParagraphStyleActions(view, readFormatting, addStyle, 'odf', {
      canEdit: true,
    });
    actions['style-title']!.run();
    expect(addStyle).toHaveBeenCalledWith(blank.styles.find((s) => s.role === 'title'));
    expect(stylesOfParagraphs()).toEqual([idOf('title')]);
  });

  it('does nothing once the editor is gone', () => {
    open([p('a')], 1);
    const { actions, choices } = textDocumentParagraphStyleActions(
      view,
      readFormatting,
      addStyle,
      'odf',
      {
        canEdit: true,
      },
    );
    view.destroy();
    actions['style-title']!.run();
    expect(choices!.styles!.read()).toBeNull();
    expect(actions['style-title']!.checked).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });
});
