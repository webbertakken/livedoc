// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Laying out": the writing measured and laid onto pages after each
// change, a spacer where each page starts, none when pages are not laid out, and Backspace or Delete across a page's
// edge deleting the character on the other side. jsdom draws nothing, so the page is drawn here by hand: each
// paragraph ten characters a line, lines 20 px high, one under another.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import {
  Styles,
  type LiveHeaders,
  type PageSetup,
  type ParagraphProps,
} from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '../text-document-schema';
import { PAGE_GAP_CLASS, measureBlock, rulesOf } from './pagination-measure';
import { storyKey } from './pagination-headers';
import { pageIndexAt, paginationPlugin, refreshPages, relayoutPages } from './pagination-plugin';

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

async function mount(
  paragraphs: ReturnType<typeof p>[],
  pages = true,
  laid: PageSetup = setup,
  stories: { headers?: LiveHeaders; heights?: Map<string, number> } = {},
) {
  const onPages = vi.fn();
  const place = document.createElement('div');
  document.body.append(place);
  const view = new EditorView(place, {
    state: EditorState.create({
      doc: schema.nodes.doc!.create(null, paragraphs),
      plugins: [
        paginationPlugin({
          readFormatting: () => formatting,
          read: () => ({ setup: laid, pages, headers: stories.headers }),
          heights: () => stories.heights ?? new Map(),
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
  // page-layout.md "Headers and footers": a header taller than its room pushes page 1's first line down.
  it('draws a header on each page and starts page 1 below a tall one', async () => {
    const headed = { ...setup, margins: { ...setup.margins, header: 0 } };
    const key = storyKey('h', 600);
    const heights = new Map<string, number>();
    const { view, onPages } = await mount([p('a'.repeat(10))], true, headed, {
      headers: { header: { default: { story: 'h' } } },
      heights,
    });
    expect(gaps(view)).toHaveLength(0);
    expect(onPages.mock.lastCall?.[0]).toEqual([
      expect.objectContaining({ header: { story: 'h', key, left: 0, width: 600, margin: 0 } }),
    ]);
    heights.set(key, 30);
    refreshPages(view);
    await Promise.resolve();
    const [gap] = gaps(view);
    expect(gap?.nextElementSibling?.tagName).toBe('P');
    expect((gap as HTMLElement).style.height).toBe('30px');
  });

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
    // Two pages of the setup, in CSS pixels.
    const place = { left: 0, width: 600, header: 48, footer: 48 };
    const plain = { top: 0, bottom: 0, section: 0, slot: 'default', place };
    const firstPage = { ...plain, first: true };
    const later = { ...plain, first: false };
    expect(onPages).toHaveBeenLastCalledWith([
      { width: 600, height: 100, number: 1, count: 2, ...firstPage },
      { width: 600, height: 100, number: 2, count: 2, ...later },
    ]);
    view.destroy();
  });

  it('finds the page a place is on, as the pages are drawn ("Editing headers and footers")', async () => {
    const { view } = await mount([p('a'.repeat(40)), p('b'.repeat(20)), p('c')]);
    expect(pageIndexAt(view, 1)).toBe(0);
    expect(pageIndexAt(view, view.state.doc.content.size - 1)).toBe(1);
    view.destroy();
    const unlaid = await mount([p('a')], false);
    expect(pageIndexAt(unlaid.view, 1)).toBe(0);
    unlaid.view.destroy();
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

  it("lays each page out at its section's setup", async () => {
    // A next-page section on a wider, shorter page: its page drawn at its own size.
    const wide: PageSetup = { ...setup, width: 600, height: 60, orientation: 'landscape' };
    const { view, onPages } = await mount([
      p('a'.repeat(10)),
      schema.nodes.section_break!.create({ start: 'next-page', setup: wide }),
      p('b'.repeat(10)),
    ]);
    expect(onPages).toHaveBeenLastCalledWith([
      {
        width: 600,
        height: 100,
        number: 1,
        count: 2,
        top: 0,
        bottom: 0,
        section: 0,
        slot: 'default',
        first: true,
        place: expect.anything(),
      },
      {
        width: 800,
        height: 80,
        number: 2,
        count: 2,
        top: 0,
        bottom: 0,
        section: 1,
        slot: 'default',
        first: true,
        place: expect.anything(),
      },
    ]);
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

describe('paginationPlugin, in columns (page-layout.md "Columns")', () => {
  const columns: PageSetup = { ...setup, columns: { count: 2, gap: 36, separator: true } };

  it('moves a block to the next column, the strip taken back up to the top, and draws the line between', async () => {
    const { view, onPages } = await mount(
      [p('a'.repeat(40)), p('b'.repeat(20), { keepTogether: true })],
      true,
      columns,
    );
    const [spacer] = gaps(view);
    // Back up from 80 px to the top: a pixel high, 81 px taken back.
    expect((spacer as HTMLElement).style.height).toBe('1px');
    expect((spacer as HTMLElement).style.marginTop).toBe('-81px');
    const second = view.dom.children[2] as HTMLElement;
    expect(second.dataset.column).toBe('1');
    expect(second.style.getPropertyValue('--column')).toBe('1');
    // One page, its line in the middle of the gap: two columns of 276 px (207 pt) with 48 px between.
    const [page] = onPages.mock.lastCall![0] as {
      rules: { xs: number[]; top: number; bottom: number }[];
    }[];
    expect(page!.rules).toEqual([{ top: 0, bottom: 80, xs: [276 + 24] }]);
    view.destroy();
  });

  it('draws a paragraph across columns as a box of columns, its lead and its column start inside it', async () => {
    const { view } = await mount([p('a'.repeat(60))], true, columns);
    const box = view.dom.children[0] as HTMLElement;
    expect(box.classList.contains('text-document-column-cross')).toBe(true);
    expect(box.style.getPropertyValue('--cross-count')).toBe('2');
    expect(box.style.getPropertyValue('--cross-height')).toBe('100px');
    const marks = box.querySelectorAll('.text-document-column-mark');
    expect(marks).toHaveLength(2);
    expect(marks[1]!.classList.contains('text-document-column-mark-split')).toBe(true);
    expect(marks[1]!.getAttribute('aria-hidden')).toBe('true');
    // Normal text prevents single lines: the fifth line goes with the sixth, so the split is after forty characters.
    expect(marks[1]!.previousSibling?.textContent).toHaveLength(40);
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

  it('reads a Word page break as the start of a page at the line after it, or after the block', () => {
    const element = document.createElement('p');
    element.textContent = 'c'.repeat(30);
    const mark = document.createElement('br');
    mark.setAttribute('data-page-break', '');
    element.append(mark);
    document.body.append(element);
    // On the second line: the third starts the page.
    mark.getBoundingClientRect = () => rect(22, 16);
    expect(measureBlock(element, {}, 1, 0).metrics).toMatchObject({ forced: [2] });
    // On the last line: the next block does.
    mark.getBoundingClientRect = () => rect(42, 16);
    const last = measureBlock(element, {}, 1, 0).metrics;
    expect(last.breakAfter).toBe(true);
    expect(last.forced).toBeUndefined();
  });

  it('reads a Word column break as the start of a column at the line after it, or after the block', () => {
    const element = document.createElement('p');
    element.textContent = 'c'.repeat(30);
    const mark = document.createElement('br');
    mark.setAttribute('data-column-break', '');
    element.append(mark);
    document.body.append(element);
    mark.getBoundingClientRect = () => rect(2, 16);
    expect(measureBlock(element, {}, 1, 0).metrics).toMatchObject({ columnForced: [1] });
    mark.getBoundingClientRect = () => rect(42, 16);
    expect(measureBlock(element, {}, 1, 0).metrics.columnBreakAfter).toBe(true);
  });
});
