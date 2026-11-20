// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Laying out": the writing measured and laid onto pages after each
// change, a spacer where each page starts, none when pages are not laid out, and Backspace or Delete across a page's
// edge deleting the character on the other side. jsdom draws nothing, so the page is drawn here by hand: each
// paragraph ten characters a line, lines 20 px high, one under another.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Styles, type PageSetup, type ParagraphProps } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '../text-document-schema';
import { PAGE_GAP_CLASS, measureBlock, rulesOf } from './pagination-measure';
import { paginationPlugin, relayoutPages } from './pagination-plugin';

const LINE = 20;
const PER_LINE = 10;
const formatting = { styles: Styles.builtIn('odf'), defaults: Styles.defaults() };
// A page whose text area is five lines high (75 pt is 100 px) and 600 px wide.
const setup: PageSetup = {
  width: 450,
  height: 75,
  orientation: 'portrait',
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
};

const p = (text: string, props: ParagraphProps | null = null) =>
  schema.nodes.paragraph!.create({ props }, text ? schema.text(text) : undefined);

const rect = (top: number, height: number, left = 0, width = 600): DOMRect =>
  ({
    top,
    bottom: top + height,
    left,
    right: left + width,
    height,
    width,
    x: left,
    y: top,
  }) as DOMRect;

const linesIn = (element: Element) =>
  Math.max(1, Math.ceil((element.textContent ?? '').length / PER_LINE));

// Each paragraph's top: the lines of the paragraphs above it.
function topOf(element: Element): number {
  let top = 0;
  for (let at = element.previousElementSibling; at; at = at.previousElementSibling)
    if (at.tagName === 'P') top += linesIn(at) * LINE;
  return top;
}

beforeEach(() => {
  // Paragraphs with no margins of their own, as the stubbed page draws them.
  const sheet = document.createElement('style');
  sheet.textContent = 'p { margin: 0 }';
  document.head.replaceChildren(sheet);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === 'P') return rect(topOf(this), linesIn(this) * LINE);
    if (this.classList.contains('ProseMirror')) return rect(0, 1000);
    return rect(0, 0);
  });
  Range.prototype.getClientRects = function (this: Range) {
    const element = this.startContainer as Element;
    const top = topOf(element);
    return Array.from({ length: linesIn(element) }, (_, k) =>
      rect(top + k * LINE + 2, LINE - 4),
    ) as unknown as DOMRectList;
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function mount(paragraphs: ReturnType<typeof p>[], pages = true) {
  const onPages = vi.fn();
  const place = document.createElement('div');
  document.body.append(place);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: schema.nodes.doc!.create(null, paragraphs),
      plugins: [
        paginationPlugin({
          readFormatting: () => formatting,
          read: () => ({ setup, pages }),
          onPages,
        }),
      ],
    }),
  });
  view.dom.style.width = '600px';
  // A place's caret top: its paragraph's top and its line in it.
  vi.spyOn(view, 'coordsAtPos').mockImplementation((pos) => {
    const $pos = view.state.doc.resolve(pos);
    const element = view.nodeDOM($pos.before(1)) as HTMLElement;
    const top = topOf(element) + Math.floor($pos.parentOffset / PER_LINE) * LINE + 2;
    return { top, bottom: top + 16, left: 0, right: 0 };
  });
  relayoutPages(view);
  await Promise.resolve();
  return { view, onPages };
}

const gaps = (view: EditorView) => [...view.dom.querySelectorAll(`.${PAGE_GAP_CLASS}`)];

describe('paginationPlugin', () => {
  it('starts a page between two lines of a paragraph, the spacer taking it to the next page', async () => {
    // 20 characters (two lines) then 40 (four): three of its lines fit, but the last would be alone, so two move.
    const { view, onPages } = await mount([
      p('a'.repeat(20)),
      p('b'.repeat(40), { widowControl: true }),
    ]);
    const [gap] = gaps(view);
    expect(gap?.parentElement?.tagName).toBe('P');
    expect(gap?.classList.contains(`${PAGE_GAP_CLASS}-inside`)).toBe(true);
    // From 80 px down to the foot (20), then the gap (12).
    expect((gap as HTMLElement).style.height).toBe('32px');
    expect(gap?.getAttribute('aria-hidden')).toBe('true');
    expect(onPages).toHaveBeenLastCalledWith(2);
    view.destroy();
  });

  it('moves a whole paragraph on with a spacer before it', async () => {
    const { view } = await mount([
      p('a'.repeat(40)),
      p('b'.repeat(20), { widowControl: true, keepTogether: true }),
    ]);
    const [gap] = gaps(view);
    expect(gap?.parentElement).toBe(view.dom);
    expect((gap as HTMLElement).style.height).toBe('32px');
    view.destroy();
  });

  it('lays out nothing when pages are not laid out', async () => {
    const { view, onPages } = await mount([p('a'.repeat(200))], false);
    expect(gaps(view)).toHaveLength(0);
    expect(onPages).not.toHaveBeenCalled();
    view.destroy();
  });

  it('lays out again after a change, and deletes across a page edge with Backspace and Delete', async () => {
    const { view } = await mount([p('a'.repeat(20)), p('b'.repeat(40), { widowControl: true })]);
    // The caret where the next page starts: after the paragraph's twentieth character.
    const at = view.state.doc.child(0).nodeSize + 1 + 20;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    const press = (key: string) =>
      view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key })));
    expect(press('Backspace')).toBe(true);
    expect(view.state.doc.child(1).textContent).toHaveLength(39);
    // The paragraph changed: its spacer went with the change and comes back laid out again.
    await Promise.resolve();
    expect(gaps(view)).toHaveLength(1);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    expect(press('Delete')).toBe(true);
    expect(view.state.doc.child(1).textContent).toHaveLength(38);
    // Away from a page edge the keys are the editor's own.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at - 5)));
    expect(press('Backspace')).toBeFalsy();
    view.destroy();
  });
});

describe('rulesOf', () => {
  it('reads a paragraph by its style and its own rules, and moves a section break and kept content whole', () => {
    expect(
      rulesOf(p('x', { keepTogether: true, pageBreakBefore: true }), formatting),
    ).toMatchObject({
      keepTogether: true,
      breakBefore: true,
    });
    const section = schema.nodes.section_break!.create({ start: 'odd-page' });
    expect(rulesOf(section, formatting)).toEqual({ atom: true, startsSection: 'odd-page' });
    expect(rulesOf(schema.nodes.section_break!.create({}), formatting).startsSection).toBe(
      'next-page',
    );
    expect(rulesOf(schema.nodes.kept_block!.create({ name: 'table' }), formatting)).toEqual({
      atom: true,
    });
  });
});

describe('measureBlock', () => {
  it('reads a block without the spacers inside it', () => {
    const element = document.createElement('p');
    element.textContent = 'c'.repeat(30);
    element.style.marginTop = '6px';
    element.style.marginBottom = '16px';
    document.body.append(element);
    const metrics = measureBlock(element, {}, 1, 0).metrics;
    expect(metrics).toMatchObject({ height: 60, marginTop: 6, marginBottom: 16 });
    expect(metrics.lines).toHaveLength(3);
  });
});
