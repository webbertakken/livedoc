// The writing laid onto pages as it is edited (docs/specs/034-text-documents/page-layout.md "Laying out"): after each
// change, before the page is painted, the blocks the change touched are measured, the pages are laid out again from
// shortly before them until they settle, and a spacer is drawn where each page starts, taking the writing from where
// it stops on one page to the next page's text area; in a section of columns (page-layout.md "Columns") each block is
// moved to its column and a paragraph across columns is drawn as a box of columns. Each page's frame is its own: a
// header or footer taller than its room pushes its body (page-layout.md "Headers and footers"), page 1's by a spacer
// before the first block. Spacers are widgets, never text.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import {
  Columns,
  type LineNumbers,
  type LiveHeaders,
  type PageSetup,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { TextFormatting } from '../text-document-formatting';
import { firstChanges } from '../text-document-tab-layout';
import {
  PAGE_GAP_PX,
  pageCount,
  pageFrame,
  type BlockMetrics,
  type Pagination,
} from './pagination';
import {
  blockSpacer,
  columnPlaces,
  crossAttrs,
  crossLead,
  crossSplit,
  pageGeometries,
  pageNumbers,
  pagesSaid,
  type PageGeometry,
} from './pagination-draw';
import { paginate } from './pagination-engine';
import { pageLayout, storyKey, type StoryHeights } from './pagination-headers';
import { notePlace, pageNotes, type NoteMark } from './pagination-notes';
import { measureBlock, PAGE_GAP_CLASS, rulesOf, splitPosition } from './pagination-measure';
import { lineNumberMarks, pageTopsInBody } from './pagination-line-numbers';
import { readDrawnLines, type CrossColumns } from './pagination-line-reading';
import {
  bodySections,
  sectionInset,
  SECTIONS_CHANGED,
  type BodySections,
} from './pagination-sections';
import {
  fieldDecorations,
  pageCountOf,
  shownPageNumbers,
  startOfBlocks,
} from './pagination-fields';

// Points to CSS pixels.
const PX_PER_PT = 96 / 72;

export type PaginationOptions = {
  readonly readFormatting: () => TextFormatting;
  /**
   * The setup the pages have, whether pages are laid out at all (not pageless, not on a phone), and the first
   * section's headers and footers.
   */
  readonly read: () => {
    readonly setup: PageSetup;
    readonly pages: boolean;
    readonly headers?: LiveHeaders;
    /** The number the first page has, if the document starts at one (page-layout.md "Page numbers"). */
    readonly numberStart?: number;
    /** The first section's line numbers (page-layout.md "Line numbers"). */
    readonly lineNumbers?: LineNumbers;
  };
  /** Each drawn header's and footer's height, by its story at its width; none known lays the pages unpushed. */
  readonly heights?: () => StoryHeights;
  /** How many pages there are now, told when it changes. */
  readonly onPages: (pages: readonly PageGeometry[]) => void;
};

export type { PageGeometry } from './pagination-draw';

// `inside`: in a paragraph, where Backspace and Delete reach across; `cross`: drawn for a box of columns.
type GapSpec = { readonly key: string; readonly inside: boolean; readonly cross?: boolean };

/** Whether the browser draws a box of columns in rows, so a paragraph may cross onto the next page in columns. */
export const canWrapColumns = (): boolean =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('column-wrap', 'wrap');

const key = new PluginKey<DecorationSet>('textDocumentPagination');

// How many blocks a layout asks the editor for one by one (each ask walks the body's blocks to its place) before it reads
// the body's children once instead (a copy of every child): a keystroke measures one to three (performance.md).
const BLOCK_LOOKUPS_ASKED = 16;

// The spacer inside a paragraph: drawn as the page's foot, the ground and the next page's head over the paragraph's
// own background and borders, across the whole page.
function lineGap(
  height: number,
  bands: { foot: number; head: number },
  across: { left: number; width: number },
): () => HTMLElement {
  return () => {
    const gap = document.createElement('span');
    gap.className = `${PAGE_GAP_CLASS} ${PAGE_GAP_CLASS}-inside`;
    gap.setAttribute('aria-hidden', 'true');
    gap.contentEditable = 'false';
    gap.style.height = `${height}px`;
    for (const [band, size] of [
      ['paper', bands.foot],
      ['ground', PAGE_GAP_PX],
      ['paper', bands.head],
    ] as const) {
      const part = document.createElement('span');
      part.className = `${PAGE_GAP_CLASS}-${band}`;
      part.style.height = `${Math.max(0, size)}px`;
      part.style.marginLeft = `${-across.left}px`;
      part.style.width = `${across.width}px`;
      gap.append(part);
    }
    return gap;
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Lays the writing out again from the start: its styles, text or fonts changed. */
export function relayoutPages(view: EditorView): void {
  // The sections drawn again too: the first section's setup may have changed.
  if (!view.isDestroyed)
    view.dispatch(view.state.tr.setMeta(SECTIONS_CHANGED, true).setMeta('addToHistory', false));
  pagers.get(view)?.invalidate();
}

/** Lays the pages out again with what they are measured at: a header's or footer's height changed. */
export function refreshPages(view: EditorView): void {
  pagers.get(view)?.schedule();
}

/**
 * The page a place in the body is on, as an index into the pages drawn (blank ones counted): the last page starting
 * at or before its paragraph; 0 before pages are laid out (page-layout.md "Editing headers and footers").
 */
export function pageIndexAt(view: EditorView, pos: number): number {
  const pagination = pagers.get(view)?.laid;
  if (!pagination) return 0;
  const block = view.state.doc.resolve(pos).index(0);
  const numbers = pageNumbers(pagination);
  let index = 0;
  pagination.starts.forEach((start, q) => {
    if (start.block <= block) index = numbers[q]! - 1;
  });
  return index;
}

/**
 * The width a note whose mark stands at `pos` is drawn at: its section's text width (page-layout.md "Footnotes");
 * null before pages are laid out.
 */
export function noteWidthAt(view: EditorView, pos: number): number | null {
  const pager = pagers.get(view);
  if (!pager?.laid) return null;
  return pager.noteWidthAt(pos);
}

const pagers = new WeakMap<EditorView, Pager>();

const heightsSaid = (heights: StoryHeights) =>
  [...heights].map(([story, height]) => `${story}=${round(height)}`).join(';');

class Pager {
  // What each block measured, by its node, and where its lines start, by node and line.
  private measured = new WeakMap<
    PmNode,
    { metrics: BlockMetrics; inset: number; marks: NoteMark[] }
  >();
  private splits = new WeakMap<PmNode, Map<number, number>>();
  private nodes: PmNode[] = [];
  private previous: Pagination | null = null;
  private layoutKey = '';
  private heightsKey = '';
  private generation = 0;
  private scheduled = false;
  private pages = '';

  private readonly view: EditorView;
  private readonly options: PaginationOptions;

  constructor(view: EditorView, options: PaginationOptions) {
    this.view = view;
    this.options = options;
  }

  /** The pages as last laid out, or null before any are. */
  get laid(): Pagination | null {
    return this.previous;
  }

  /** The text width of the section `pos` is in, which its note is drawn at. */
  noteWidthAt(pos: number): number {
    const { doc } = this.view.state;
    const { setup, headers, numberStart, lineNumbers } = this.options.read();
    const sections = bodySections(doc, setup, headers, numberStart, lineNumbers);
    const block = doc.resolve(Math.min(pos, doc.content.size)).index(0);
    return notePlace(sections.setups[sections.sectionOf[block] ?? 0]!).width;
  }

  invalidate(): void {
    this.generation += 1;
    this.schedule();
  }

  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    // Before the page is painted, after the change and the tab stops are drawn.
    queueMicrotask(() => {
      this.scheduled = false;
      if (!this.view.isDestroyed) this.layOut();
    });
  }

  private tellPages(pages: readonly PageGeometry[]): void {
    const said = pagesSaid(pages);
    if (said === this.pages) return;
    this.pages = said;
    this.options.onPages(pages);
  }

  // Draws what the decorations change of the ones drawn (mapped through the edits since): those no longer laid out go,
  // new ones come, the rest stay as drawn. A keystroke that moves no page start, column or field changes nothing; one in
  // a paragraph across a page draws that paragraph's spacer again, never the whole body's (performance.md).
  private apply(decorations: readonly Decoration[]): void {
    const current = key.getState(this.view.state) ?? DecorationSet.empty;
    const said = (d: Decoration) => `${d.from}:${(d.spec as GapSpec).key}`;
    const wanted = new Map<string, number>();
    for (const d of decorations) wanted.set(said(d), (wanted.get(said(d)) ?? 0) + 1);
    const gone: Decoration[] = [];
    for (const d of current.find()) {
      const left = wanted.get(said(d)) ?? 0;
      if (left > 0) wanted.set(said(d), left - 1);
      else gone.push(d);
    }
    const added = decorations.filter((d) => {
      const left = wanted.get(said(d)) ?? 0;
      if (left === 0) return false;
      wanted.set(said(d), left - 1);
      return true;
    });
    if (gone.length === 0 && added.length === 0) return;
    const set = current.remove(gone).add(this.view.state.doc, added);
    this.view.dispatch(this.view.state.tr.setMeta(key, set).setMeta('addToHistory', false));
  }

  // Takes away the boxes of columns drawn for the paragraphs `which` picks, so they are read as one column.
  private unbox(which: (node: PmNode) => boolean): void {
    const { state } = this.view;
    const current = key.getState(state) ?? DecorationSet.empty;
    const boxes = current
      .find(undefined, undefined, (spec) => (spec as GapSpec).cross === true)
      .filter((d) => {
        const node = state.doc.nodeAt(d.from);
        return d.to > d.from && node !== null && which(node);
      });
    if (boxes.length === 0) return;
    const inside = boxes.flatMap((box) =>
      current.find(box.from, box.to, (spec) => (spec as GapSpec).cross === true),
    );
    this.view.dispatch(
      state.tr.setMeta(key, current.remove([...boxes, ...inside])).setMeta('addToHistory', false),
    );
  }

  private layOut(): void {
    const { view } = this;
    const { setup, pages, headers, numberStart, lineNumbers } = this.options.read();
    if (!pages) {
      this.previous = null;
      this.nodes = [];
      this.apply([]);
      this.tellPages([]);
      return;
    }
    const body = view.dom;
    const width = Number.parseFloat(getComputedStyle(body).width);
    const box = body.getBoundingClientRect();
    // Hidden (a tab not shown): nothing to measure; the next change lays it out.
    if (!(width > 0) || box.width === 0) return;
    const ratio = box.width / width;
    const started = performance.now();
    const sections = bodySections(view.state.doc, setup, headers, numberStart, lineNumbers);
    const layoutKey = [
      width,
      sections.setups
        .map((s) =>
          [
            s.width,
            s.height,
            s.margins.top,
            s.margins.bottom,
            s.margins.left,
            s.margins.right,
            s.columns?.count ?? 1,
            s.columns?.gap ?? 0,
          ].join(','),
        )
        .join(';'),
      body.getAttribute('style') ?? '',
      this.generation,
    ].join('|');
    if (layoutKey !== this.layoutKey) {
      this.layoutKey = layoutKey;
      this.measured = new WeakMap();
      this.splits = new WeakMap();
      this.previous = null;
    }
    // A header's or footer's new height moves the pages, never a block's lines.
    const heights = this.options.heights?.() ?? new Map<string, number>();
    const heightsKey = heightsSaid(heights);
    if (heightsKey !== this.heightsKey) {
      this.heightsKey = heightsKey;
      this.previous = null;
    }

    const { doc } = view.state;
    const nodes: PmNode[] = [];
    const positions: number[] = [];
    doc.forEach((node, pos) => {
      nodes.push(node);
      positions.push(pos);
    });
    // What changed, by identity from both ends; each side's neighbour too (a join or a box moves it).
    const before = this.nodes;
    let first = 0;
    while (first < nodes.length && first < before.length && nodes[first] === before[first])
      first += 1;
    let tail = 0;
    while (
      tail < nodes.length - first &&
      tail < before.length - first &&
      nodes[nodes.length - 1 - tail] === before[before.length - 1 - tail]
    )
      tail += 1;
    const delta = nodes.length - before.length;
    const unchanged = first === nodes.length && delta === 0;
    first = Math.max(0, first - 1);
    const last = Math.min(nodes.length - 1, nodes.length - 1 - tail + 1);
    for (let i = first; i <= last; i++) this.measured.delete(nodes[i]!);
    // A paragraph drawn as a box of columns measures unbroken: its box goes before it is measured.
    this.unbox((node) => !this.measured.has(node));

    const elements = blockElements(view, nodes, positions);
    const formatting = this.options.readFormatting();
    let count = 0;
    const marks: (NoteMark[] | undefined)[] = [];
    const frames = sections.setups.map(pageFrame);
    const frameOf = (block: number) => frames[sections.sectionOf[block] ?? 0]!;
    // A note is drawn at its mark's section's left margin and text width (page-layout.md "Footnotes").
    const noteIn = (block: number) => notePlace(sections.setups[sections.sectionOf[block] ?? 0]!);
    const metrics = nodes.map((node, i) => {
      let entry = this.measured.get(node);
      if (!entry) {
        entry = measureBlock(elements(i), rulesOf(node, formatting), ratio, box.left);
        this.measured.set(node, entry);
        count += 1;
      }
      if (entry.marks.length === 0) return entry.metrics;
      marks[i] = entry.marks;
      const { width } = noteIn(i);
      const notes = entry.marks.map((m) => ({
        line: m.line,
        height: heights.get(storyKey(m.story, width)) ?? 0,
      }));
      return { ...entry.metrics, notes };
    });
    this.nodes = nodes;
    const page = pageLayout({ ...sections, heights });
    const pagination =
      unchanged && this.previous
        ? this.previous
        : paginate(
            metrics,
            frameOf,
            this.previous
              ? { previous: this.previous, first, last: Math.max(first - 1, last), delta }
              : undefined,
            { wrap: canWrapColumns(), pageFrameOf: page.frameOf, oddEven: page.oddEven },
          );
    this.previous = pagination;

    const decorations: Decoration[] = [];
    const widget = (at: number, draw: () => HTMLElement, spec: GapSpec) =>
      decorations.push(Decoration.widget(at, draw, { side: -1, ignoreSelection: true, ...spec }));
    const numbers = pageNumbers(pagination);
    pagination.starts.forEach((start, q) => {
      const pos = positions[start.block]!;
      const height = round(start.gap);
      // Page 1's writing below a tall header.
      if (q === 0 && height > 0)
        widget(pos, blockSpacer(height), { key: `gap:${height}`, inside: false });
      if (q > 0 && !start.carried && start.line === 0)
        widget(pos, blockSpacer(height), { key: `gap:${height}`, inside: false });
      else if (q > 0 && !start.carried) {
        const node = nodes[start.block]!;
        const at =
          pos +
          this.splitOffset(
            node,
            pos,
            start.line,
            metrics[start.block]!,
            () => elements(start.block),
            ratio,
          );
        const inset = this.measured.get(node)?.inset ?? 0;
        // The page across, from the first section's text area: pages are centred one under another.
        const own = sections.setups[sections.sectionOf[start.block] ?? 0]!;
        const across = {
          left: round(inset + (setup.margins.left - (setup.width - own.width) / 2) * PX_PER_PT),
          width: round(own.width * PX_PER_PT),
        };
        const head = round(page.frameOf(start.block, start.line, numbers[q]!).top);
        const bands = { foot: round(height - PAGE_GAP_PX - head), head };
        widget(at, lineGap(height, bands, across), {
          key: `line:${height}:${across.left}:${across.width}:${head}`,
          inside: true,
        });
      }
      for (const spacer of start.spacers ?? []) {
        const h = round(spacer.height);
        widget(positions[spacer.block]!, blockSpacer(h), { key: `spacer:${h}`, inside: false });
      }
      for (const cross of start.crosses ?? []) {
        const at = positions[cross.block]!;
        const node = nodes[cross.block]!;
        const attrs = crossAttrs(cross);
        decorations.push(
          Decoration.node(at, at + node.nodeSize, attrs, {
            key: `cross:${attrs.style}:${cross.rows}`,
            inside: false,
            cross: true,
          }),
        );
        widget(at + 1, crossLead(cross), {
          key: `lead:${cross.column}:${round(cross.lead)}`,
          inside: false,
          cross: true,
        });
        for (const line of cross.splits) {
          const split =
            at +
            this.splitOffset(
              node,
              at,
              line,
              metrics[cross.block]!,
              () => elements(cross.block),
              ratio,
            );
          widget(split, crossSplit, { key: `split:${line}`, inside: true, cross: true });
        }
      }
    });
    // Each block of a region past its first column, moved across to its column.
    for (const [block, column] of columnPlaces(pagination, sections.sectionOf, nodes.length)) {
      const at = positions[block]!;
      decorations.push(
        Decoration.node(
          at,
          at + nodes[block]!.nodeSize,
          { 'data-column': String(column), style: `--column: ${column}` },
          { key: `column:${column}`, inside: false },
        ),
      );
    }
    // Each field's page number and the page count (page-layout.md "Page numbers").
    const shown = shownPageNumbers(pagination, sections);
    const pagesLaid = pageCountOf(pagination);
    const startOf = startOfBlocks(pagination, nodes.length);
    decorations.push(
      ...fieldDecorations(nodes, positions, (block) => shown[startOf[block]!]!, pagesLaid),
    );
    this.apply(decorations);
    const geometries = pageGeometries(pagination, {
      frameOf,
      page,
      shown,
      notes: pageNotes(pagination, marks, noteIn),
      lineBetween: (block) =>
        Boolean(sections.setups[sections.sectionOf[block] ?? 0]?.columns?.separator),
    });
    this.tellPages(
      sections.lineNumbers.some(Boolean)
        ? withLineNumbers(geometries, {
            view,
            nodes,
            metrics,
            pagination,
            sections,
            ratio,
            // Read again: a block drawn anew for its column or its box has a new element.
            element: blockElements(view, nodes, positions),
          })
        : geometries,
    );
    if (count > 0 || !unchanged)
      debugLog('[text-document] layout', {
        pages: pageCount(pagination),
        measured: count,
        from: pagination.laidFrom,
        settled: pagination.settledAt,
        ms: Math.round((performance.now() - started) * 10) / 10,
      });

    // A block's element: asked of the editor for the first few, as a keystroke measures one or two; past those, read
    // from the body's children (its blocks and the spacers between them, in order), once.
    function blockElements(v: EditorView, all: PmNode[], at: number[]) {
      let asked = 0;
      let children: Element[] | null = null;
      return (i: number): HTMLElement => {
        asked += 1;
        if (asked <= BLOCK_LOOKUPS_ASKED) return v.nodeDOM(at[i]!) as HTMLElement;
        children ??= [...v.dom.children].filter((c) => !c.classList.contains(PAGE_GAP_CLASS));
        return (children.length === all.length ? children[i] : v.nodeDOM(at[i]!)) as HTMLElement;
      };
    }
  }

  // Where block at `pos`'s line `line` starts, from the block's start: kept while the block is unchanged.
  private splitOffset(
    node: PmNode,
    pos: number,
    line: number,
    metrics: BlockMetrics,
    element: () => HTMLElement,
    ratio: number,
  ): number {
    let lines = this.splits.get(node);
    if (!lines) this.splits.set(node, (lines = new Map<number, number>()));
    const known = lines.get(line);
    if (known !== undefined) return known;
    // Found on the paragraph as one column: a box of columns it is drawn as goes first.
    this.unbox((boxed) => boxed === node);
    const at =
      splitPosition(this.view, pos, node, element(), metrics.lines[line]!.top, ratio) - pos;
    lines.set(line, at);
    return at;
  }
}

/**
 * The pages with each numbered line's number (page-layout.md "Line numbers"): the lines read as drawn, once the
 * layout's spacers and columns are, and counted onto the pages they fall on.
 */
function withLineNumbers(
  pages: readonly PageGeometry[],
  laid: {
    readonly view: EditorView;
    readonly nodes: readonly PmNode[];
    readonly metrics: readonly BlockMetrics[];
    readonly pagination: Pagination;
    readonly sections: BodySections;
    readonly ratio: number;
    readonly element: (block: number) => HTMLElement;
  },
): PageGeometry[] {
  const { nodes, pagination, sections } = laid;
  const first = sections.setups[0]!;
  const gapsInside = new Map<number, { line: number; gap: number }[]>();
  const crosses = new Map<number, CrossColumns>();
  pagination.starts.forEach((start, q) => {
    if (q > 0 && !start.carried && start.line > 0)
      gapsInside.set(start.block, [
        ...(gapsInside.get(start.block) ?? []),
        { line: start.line, gap: round(start.gap) },
      ]);
    for (const cross of start.crosses ?? []) {
      const inset = sectionInset(
        first,
        sections.setups[sections.sectionOf[cross.block] ?? 0]!,
        true,
      );
      crosses.set(cross.block, {
        shift: inset?.shift ?? 0,
        step: inset?.columns?.step ?? 1,
        count: cross.count,
      });
    }
  });
  const pageTops = pageTopsInBody(pages, first.margins.top * PX_PER_PT);
  const lines = readDrawnLines({
    body: laid.view.dom,
    ratio: laid.ratio,
    metrics: laid.metrics,
    element: laid.element,
    numbered: (block) =>
      nodes[block]!.type.name === 'paragraph' &&
      sections.lineNumbers[sections.sectionOf[block] ?? 0] !== undefined,
    gapsInside,
    columnOf: columnPlaces(pagination, sections.sectionOf, nodes.length),
    crosses,
    pageTops,
  });
  const marks = lineNumberMarks({
    lines,
    sectionOf: sections.sectionOf,
    numbering: sections.lineNumbers,
    pageTops,
    leftOf: (section, column) => {
      const setup = sections.setups[section]!;
      const { gap } = Columns.of(setup);
      return (setup.margins.left + column * (Columns.width(setup) + gap)) * PX_PER_PT;
    },
  });
  return pages.map((page, index) =>
    marks[index]?.length ? { ...page, lines: marks[index] } : page,
  );
}

// Backspace and Delete beside a spacer inside a paragraph delete the character across it, as across a line's end.
function deleteAcross(state: EditorState, view: EditorView, backward: boolean): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  const gaps = key.getState(state)?.find($from.pos, $from.pos, (spec) => (spec as GapSpec).inside);
  if (!gaps || gaps.length === 0) return false;
  if (backward ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size)
    return false;
  const text = backward
    ? state.doc.textBetween(Math.max($from.start(), $from.pos - 2), $from.pos)
    : state.doc.textBetween($from.pos, Math.min($from.end(), $from.pos + 2));
  // A character outside the basic plane is two code units.
  const pair = text.length === 2 && /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(text);
  const size = pair ? 2 : 1;
  view.dispatch(
    backward
      ? state.tr.delete($from.pos - size, $from.pos).scrollIntoView()
      : state.tr.delete($from.pos, $from.pos + size).scrollIntoView(),
  );
  return true;
}

export function paginationPlugin(options: PaginationOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => {
        const laid = tr.getMeta(key) as DecorationSet | undefined;
        if (laid) return laid;
        if (!tr.docChanged) return set;
        const mapped = set.map(tr.mapping, tr.doc);
        // A changed paragraph measures unbroken: its box of columns goes, and each spacer inside it that the change
        // came before (its lines before the page edge may break anew), until it is laid out again. A spacer before
        // the change stays: the lines before it are as they were (performance.md "A keystroke's frame").
        const changed = firstChanges(tr);
        const gone: Decoration[] = [];
        for (const [pos, from] of changed) {
          const node = tr.doc.nodeAt(pos)!;
          for (const d of mapped.find(pos, pos + node.nodeSize, (spec) => {
            const gap = spec as GapSpec;
            return gap.inside || gap.cross === true;
          }))
            if ((d.spec as GapSpec).cross === true || d.from > from) gone.push(d);
        }
        return gone.length > 0 ? mapped.remove(gone) : mapped;
      },
    },
    props: {
      decorations: (state) => key.getState(state),
      handleKeyDown: (view, event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return false;
        if (event.key === 'Backspace') return deleteAcross(view.state, view, true);
        if (event.key === 'Delete') return deleteAcross(view.state, view, false);
        return false;
      },
    },
    view: (view) => {
      const pager = new Pager(view, options);
      pagers.set(view, pager);
      pager.invalidate();
      let width = 0;
      // A new width breaks every line anew.
      const resize =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(([entry]) => {
              const now = entry?.contentRect.width ?? 0;
              if (now === width) return;
              width = now;
              pager.invalidate();
            });
      resize?.observe(view.dom);
      const fonts = () => pager.invalidate();
      document.fonts?.addEventListener('loadingdone', fonts);
      return {
        update: (updated, previous) => {
          if (updated.state.doc !== previous.doc) pager.schedule();
        },
        destroy: () => {
          resize?.disconnect();
          document.fonts?.removeEventListener('loadingdone', fonts);
          pagers.delete(view);
        },
      };
    },
  });
}
