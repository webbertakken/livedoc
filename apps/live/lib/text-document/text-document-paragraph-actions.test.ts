// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Alignment and indents": Format > Align & indent and the
// toolbar's Align and indent controls bound to the writing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { lucideAlignCenter, lucideAlignLeft } from '@livedoc/icons/lucide';
import { TextDocument } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  ALIGNMENTS,
  LINE_SPACING_ENTRIES,
  textDocumentParagraphActions,
} from './text-document-paragraph-actions';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const blank = TextDocument.blank({ format: 'odf' });
const readFormatting = () => ({ styles: blank.styles, defaults: blank.defaults });
const openIndentation = vi.fn();
const openSpacing = vi.fn();
let view: EditorView;

function open(props: unknown[] = [null, null]) {
  const doc = schema.node(
    'doc',
    null,
    props.map((p, i) => schema.nodes.paragraph!.create({ props: p }, schema.text(`p${i}`))),
  );
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
  });
}
const bind = (canEdit = true) =>
  textDocumentParagraphActions({ view, readFormatting, canEdit, openIndentation, openSpacing });
const propsOf = () => {
  const out: unknown[] = [];
  view.state.doc.forEach((node) => out.push((node.attrs as { props: unknown }).props));
  return out;
};

beforeEach(() => {
  vi.mocked(track).mockClear();
  openIndentation.mockClear();
  openSpacing.mockClear();
});
afterEach(() => view?.destroy());

describe('textDocumentParagraphActions', () => {
  it('binds nothing for a session that does not write', () => {
    open();
    expect(bind(false)).toEqual({ actions: {}, choices: null });
  });

  it('aligns from an item, checks the one there is, focuses the writing and counts it', () => {
    open();
    const { actions } = bind();
    expect(actions['align-left']!.checked).toBe(true);
    actions['align-centre']!.run();
    expect(propsOf()).toEqual([{ align: 'center' }, null]);
    expect(actions['align-centre']!.checked).toBe(true);
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentAlign');
  });

  it('indents and outdents, counted', () => {
    open();
    const { actions } = bind();
    actions['indent-increase']!.run();
    actions['indent-increase']!.run();
    actions['indent-decrease']!.run();
    expect(propsOf()).toEqual([{ indentStart: 36 }, null]);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentIndent');
  });

  it('opens Indentation options', () => {
    open();
    bind().actions['indentation-options']!.run();
    expect(openIndentation).toHaveBeenCalled();
  });

  it("gives the Align control the alignment there is and its icon, none and Left's icon when mixed", () => {
    open([{ align: 'center' }, null]);
    const align = bind().choices!.align!;
    expect(align.read()).toBe('Centre');
    expect(align.iconOf!('Centre')).toBe(lucideAlignCenter);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 7)));
    expect(align.read()).toBeNull();
    expect(align.iconOf!(null)).toBe(lucideAlignLeft);
    expect(align.entries.map((e) => e.kind === 'item' && e.label)).toEqual(
      ALIGNMENTS.map((a) => a.label),
    );
  });

  it('does nothing once the editor is gone', () => {
    open();
    const { actions, choices } = bind();
    view.destroy();
    actions['align-right']!.run();
    actions['indent-increase']!.run();
    actions['indentation-options']!.run();
    expect(choices!.align!.read()).toBeNull();
    expect(track).not.toHaveBeenCalled();
    expect(openIndentation).not.toHaveBeenCalled();
  });
});

// text-and-paragraphs.md "Spacing and keep rules".
describe('textDocumentParagraphActions, spacing and keep rules', () => {
  it('sets line spacing from an item, checks the one there is, and counts it', () => {
    open();
    const { actions } = bind();
    expect(actions['spacing-115']!.checked).toBe(true);
    actions['spacing-double']!.run();
    expect(propsOf()).toEqual([{ lineHeight: { rule: 'multiple', value: 2 } }, null]);
    expect(actions['spacing-double']!.checked).toBe(true);
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentLineSpacing');
  });

  it('names Add or Remove space for what it does now, and does it', () => {
    open();
    const { actions } = bind();
    expect(actions['space-after']!.label).toBe('Add space after paragraph');
    actions['space-after']!.run();
    expect(propsOf()).toEqual([{ spaceAfter: 12 }, null]);
    expect(actions['space-after']!.label).toBe('Remove space after paragraph');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentParagraphSpace');
  });

  it('switches a keep rule, checked when every paragraph has it', () => {
    open();
    const { actions } = bind();
    expect(actions['prevent-single-lines']!.checked).toBe(true);
    expect(actions['keep-with-next']!.checked).toBe(false);
    actions['keep-with-next']!.run();
    expect(actions['keep-with-next']!.checked).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentKeepRule');
  });

  it("opens Custom spacing, and gives the toolbar's control the Format menu's entries", () => {
    open();
    const { actions, choices } = bind();
    actions['custom-spacing']!.run();
    expect(openSpacing).toHaveBeenCalled();
    expect(choices!['line-spacing']!.entries).toBe(LINE_SPACING_ENTRIES);
    expect(choices!['line-spacing']!.read()).toBeNull();
  });
});
