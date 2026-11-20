// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles": applying a style, the style at the caret,
// the Styles control and Format > Paragraph styles.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  StyleLooks,
  Styles,
  TextDocument,
  type DefaultStyles,
  type Style,
} from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  PARAGRAPH_STYLE_ITEMS,
  paragraphStyleEntries,
  paragraphStyleNameOf,
  STYLE_OPTIONS,
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
const setStyles = vi.fn((changed: readonly Style[]) => {
  styles = [
    ...styles.map((s) => changed.find((c) => c.id === s.id) ?? s),
    ...changed.filter((c) => !styles.some((s) => s.id === c.id)),
  ];
});
let saved: DefaultStyles = {};
const readSaved = () => saved;
const saveSaved = vi.fn();
const lookOf = (role: NonNullable<Style['role']>) =>
  StyleLooks.of(styles, blank.defaults, Styles.idOfRole(styles, role));

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
  setStyles.mockClear();
  saveSaved.mockClear();
  saved = {};
  vi.mocked(track).mockClear();
});
afterEach(() => view?.destroy());

describe('PARAGRAPH_STYLE_ITEMS', () => {
  it('lists the nine styles with Format > Paragraph styles item ids and their shortcut arguments', () => {
    expect(PARAGRAPH_STYLE_ITEMS.map((s) => [s.item, s.update, s.label, s.shortcutArg])).toEqual([
      ['style-normal', 'update-style-normal', 'Normal text', undefined],
      ['style-title', 'update-style-title', 'Title', undefined],
      ['style-subtitle', 'update-style-subtitle', 'Subtitle', undefined],
      ...[1, 2, 3, 4, 5, 6].map((n) => [
        `style-heading-${n}`,
        `update-style-heading-${n}`,
        `Heading ${n}`,
        String(n),
      ]),
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

const bind = (canEdit = true, editor: EditorView | null = view) =>
  textDocumentParagraphStyleActions({
    view: editor,
    readFormatting,
    styles: { add: addStyle, set: setStyles },
    defaultStyles: { read: readSaved, save: saveSaved },
    format: 'odf',
    canEdit,
  });

describe('textDocumentParagraphStyleActions', () => {
  it('binds nothing without an editor, or for a session that does not write', () => {
    expect(bind(true, null)).toEqual({ actions: {}, choices: null });
    open([p('a')], 1);
    expect(bind(false).choices).toBeNull();
  });

  it('applies a style from an item, checks the one at the caret, focuses the writing and counts it', () => {
    open([p('a')], 1);
    const { actions, choices } = bind();
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

  it('draws each style as a row in its look that applies it, its submenu Apply and Update, then Options', () => {
    open([p('a')], 1);
    const entries = bind().choices!.styles!.entries;
    const title = entries.find((e) => e.kind === 'submenu' && e.id === 'style-title-menu');
    expect(title).toMatchObject({
      label: 'Title',
      run: 'style-title',
      checkable: 'radio',
      faceStyle: { fontSize: '22px' },
    });
    expect(
      title!.kind === 'submenu' && title!.entries.map((e) => e.kind === 'item' && e.label),
    ).toEqual(["Apply 'Title'", "Update 'Title' to match"]);
    const h6 = entries.find((e) => e.kind === 'submenu' && e.id === 'style-heading-6-menu');
    expect(h6).toMatchObject({ faceStyle: { fontSize: '14.7px', fontStyle: 'italic' } });
    expect(entries.at(-1)).toBe(STYLE_OPTIONS);
    expect(paragraphStyleEntries(PARAGRAPH_STYLE_ITEMS[4]!)[0]).toMatchObject({
      id: 'style-heading-2',
      shortcut: 'apply-heading-style-n',
      shortcutArg: '2',
    });
  });

  it('adds a style the document lacks before applying it', () => {
    styles = blank.styles.filter((s) => s.role !== 'title');
    open([p('a')], 1);
    bind().actions['style-title']!.run();
    expect(addStyle).toHaveBeenCalledWith(blank.styles.find((s) => s.role === 'title'));
    expect(stylesOfParagraphs()).toEqual([idOf('title')]);
  });

  it('does nothing once the editor is gone', () => {
    open([p('a')], 1);
    const { actions, choices } = bind();
    view.destroy();
    actions['style-title']!.run();
    actions['update-style-title']!.run();
    actions['reset-styles']!.run();
    expect(choices!.styles!.read()).toBeNull();
    expect(actions['style-title']!.checked).toBe(false);
    expect(track).not.toHaveBeenCalled();
    expect(setStyles).not.toHaveBeenCalled();
  });
});

// text-and-paragraphs.md "Update to match".
describe('Update to match', () => {
  const bold = (text: string) => schema.text(text, [schema.marks.bold!.create({ value: true })]);

  it('sets the style from the caret, the paragraph takes it wholly, other styles keep their look', () => {
    const big = schema.text('Big', [schema.marks.size!.create({ value: 30 })]);
    open([schema.nodes.paragraph!.create({ style: null }, [big]), p('h', idOf('heading1'))], 2);
    const h1Before = lookOf('heading1');
    bind().actions['update-style-title']!.run();
    expect(lookOf('title').text.size).toBe(30);
    expect(lookOf('heading1')).toEqual(h1Before);
    expect(stylesOfParagraphs()).toEqual([idOf('title'), idOf('heading1')]);
    expect(view.state.doc.firstChild!.firstChild!.marks).toEqual([]);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentStyleUpdated');
    expect(view.hasFocus()).toBe(true);
  });

  it('updates Normal text, leaving the paragraph with no style of its own, and changes no heading', () => {
    open([schema.nodes.paragraph!.create({ style: idOf('heading3') }, [bold('Strong')])], 2);
    const headings = (['title', 'heading1', 'heading2', 'heading6'] as const).map(lookOf);
    bind().actions['update-style-normal']!.run();
    expect(lookOf('normal').text).toMatchObject({ bold: true, size: 14, color: '#434343' });
    expect((['title', 'heading1', 'heading2', 'heading6'] as const).map(lookOf)).toEqual(headings);
    expect(stylesOfParagraphs()).toEqual([null]);
  });

  it("adds a style the document lacks from a new document's set", () => {
    styles = blank.styles.filter((s) => s.role !== 'subtitle');
    open([p('Quiet')], 2);
    bind().actions['update-style-subtitle']!.run();
    expect(styles.some((s) => s.role === 'subtitle')).toBe(true);
    expect(stylesOfParagraphs()).toEqual([idOf('subtitle')]);
  });
});

// text-and-paragraphs.md "Default styles".
describe('Styles > Options', () => {
  it("saves the document's looks as the person's default styles, only what differs, and counts it", () => {
    styles = blank.styles.map((s) =>
      s.role === 'heading2' ? { ...s, text: { ...s.text, size: 17 } } : s,
    );
    open([p('a')], 1);
    bind().actions['save-default-styles']!.run();
    expect(saveSaved).toHaveBeenCalledWith({ heading2: { text: { size: 17 } } });
    expect(track).toHaveBeenCalledWith('UI', 'Changed', 'TextDocumentDefaultStyles');
    expect(setStyles).not.toHaveBeenCalled();
  });

  it("uses the person's default styles, Google's where none is saved, and counts it", () => {
    styles = blank.styles.map((s) => (s.role === 'title' ? { ...s, text: { size: 40 } } : s));
    saved = { normal: { text: { font: 'Georgia' } } };
    open([p('a')], 1);
    bind().actions['use-default-styles']!.run();
    expect(lookOf('normal').text.font).toBe('Georgia');
    expect(lookOf('title').text).toMatchObject({ size: 26, font: 'Arial' });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentStylesUsed');
  });

  it("resets the styles to Google's, and counts it", () => {
    styles = blank.styles.map((s) => (s.role === 'heading4' ? { ...s, text: { size: 9 } } : s));
    open([p('a')], 1);
    bind().actions['reset-styles']!.run();
    expect(lookOf('heading4').text).toMatchObject({ size: 12, color: '#666666' });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentStylesReset');
  });

  it("writes nothing to reset a document already in Google's styles", () => {
    open([p('a')], 1);
    bind().actions['reset-styles']!.run();
    expect(setStyles).toHaveBeenCalledWith([]);
  });
});
