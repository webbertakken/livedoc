// The writing laid onto pages as it is edited (docs/specs/034-text-documents/page-layout.md "Laying out"): after each
// change, before the page is painted, the blocks the change touched are measured, the pages are laid out again from
// shortly before them until they settle, and a spacer is drawn where each page starts, taking the writing from where
// it stops on one page to the next page's text area. The spacers are widgets, never part of the text.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { PageSetup } from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { TextFormatting } from '../text-document-formatting';
import { touchedParagraphs } from '../text-document-tab-layout';
import {
  PAGE_GAP_PX,
  pageCount,
  pageFrame,
  paginate,
  type BlockMetrics,
  type PageFrame,
  type PageStart,
  type Pagination,
} from './pagination';
import { measureBlock, PAGE_GAP_CLASS, rulesOf, splitPosition } from './pagination-measure';
import { bodySections, SECTIONS_CHANGED } from './pagination-sections';

// Points to CSS pixels.
const PX_PER_PT = 96 / 72;

export type PaginationOptions = {
  readonly readFormatting: () => TextFormatting;
  /** The setup the pages have, and whether pages are laid out at all (not pageless, not on a phone). */
  readonly read: () => { readonly setup: PageSetup; readonly pages: boolean };
  /** How many pages there are now, told when it changes. */
  readonly onPages: (pages: readonly PageGeometry[]) => void;
};

/** A page's size in CSS pixels. */
export type PageGeometry = { readonly width: number; readonly height: number };

type GapSpec = { readonly key: string; readonly inside: boolean };

const key = new PluginKey<DecorationSet>('textDocumentPagination');

// The spacer before a block: the ground between pages, drawn by the sheets behind it.
function blockGap(height: number): () => HTMLElement {
  return () => {
    const gap = document.createElement('div');
    gap.className = PAGE_GAP_CLASS;
    gap.setAttribute('aria-hidden', 'true');
    gap.contentEditable = 'false';
    gap.style.height = `${height}px`;
    return gap;
  };
}

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

/** Each page's size in CSS pixels, blank pages too, each by the section of the block it starts with. */
export function pagesOf(
  pagination: Pagination,
  frameOf: (block: number) => PageFrame,
): PageGeometry[] {
  const pages: PageGeometry[] = [];
  for (const start of pagination.starts) {
    const frame = frameOf(start.block);
    const page = { width: round(frame.width), height: round(frame.height) };
    for (let blank = 0; blank <= start.blank; blank++) pages.push(page);
  }
  return pages;
}

/** Lays the writing out again from the start: its styles, text or fonts changed. */
export function relayoutPages(view: EditorView): void {
  // The sections drawn again too: the first section's setup may have changed.
  if (!view.isDestroyed)
    view.dispatch(view.state.tr.setMeta(SECTIONS_CHANGED, true).setMeta('addToHistory', false));
  pagers.get(view)?.invalidate();
}

const pagers = new WeakMap<EditorView, Pager>();

class Pager {
  // What each block measured, by its node, and where its lines start, by node and line.
  private measured = new WeakMap<PmNode, { metrics: BlockMetrics; inset: number }>();
  private splits = new WeakMap<PmNode, Map<number, number>>();
  private nodes: PmNode[] = [];
  private previous: Pagination | null = null;
  private layoutKey = '';
  private generation = 0;
  private scheduled = false;
  private pages = '';

  private readonly view: EditorView;
  private readonly options: PaginationOptions;

  constructor(view: EditorView, options: PaginationOptions) {
    this.view = view;
    this.options = options;
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
    const said = pages.map((p) => `${p.width}x${p.height}`).join(',');
    if (said === this.pages) return;
    this.pages = said;
    this.options.onPages(pages);
  }

  private apply(decorations: DecorationSet): void {
    const current = key.getState(this.view.state) ?? DecorationSet.empty;
    const was = current.find().map((d) => `${d.from}:${(d.spec as GapSpec).key}`);
    const now = decorations.find().map((d) => `${d.from}:${(d.spec as GapSpec).key}`);
    if (was.length === now.length && was.every((w, i) => w === now[i])) return;
    this.view.dispatch(this.view.state.tr.setMeta(key, decorations).setMeta('addToHistory', false));
  }

  private layOut(): void {
    const { view } = this;
    const { setup, pages } = this.options.read();
    if (!pages) {
      this.previous = null;
      this.nodes = [];
      this.apply(DecorationSet.empty);
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
    const sections = bodySections(view.state.doc, setup);
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

    const elements = blockElements(view, nodes, positions);
    const formatting = this.options.readFormatting();
    let count = 0;
    const metrics = nodes.map((node, i) => {
      let entry = this.measured.get(node);
      if (!entry) {
        entry = measureBlock(elements(i), rulesOf(node, formatting), ratio, box.left);
        this.measured.set(node, entry);
        count += 1;
      }
      return entry.metrics;
    });
    this.nodes = nodes;
    const frames = sections.setups.map(pageFrame);
    const frameOf = (block: number) => frames[sections.sectionOf[block] ?? 0]!;
    const pagination =
      unchanged && this.previous
        ? this.previous
        : paginate(
            metrics,
            frameOf,
            this.previous
              ? { previous: this.previous, first, last: Math.max(first - 1, last), delta }
              : undefined,
          );
    this.previous = pagination;

    const decorations = pagination.starts.slice(1).map((start) => {
      const height = round(start.gap);
      const pos = positions[start.block]!;
      if (start.line === 0)
        return Decoration.widget(pos, blockGap(height), {
          side: -1,
          ignoreSelection: true,
          key: `gap:${height}`,
          inside: false,
        });
      const node = nodes[start.block]!;
      const at = pos + this.splitOffset(node, pos, start, metrics[start.block]!, elements, ratio);
      const inset = this.measured.get(node)?.inset ?? 0;
      // The page across, from the first section's text area: pages are centred one under another.
      const own = sections.setups[sections.sectionOf[start.block] ?? 0]!;
      const across = {
        left: round(inset + (setup.margins.left - (setup.width - own.width) / 2) * PX_PER_PT),
        width: round(own.width * PX_PER_PT),
      };
      const head = round(own.margins.top * PX_PER_PT);
      const bands = { foot: round(height - PAGE_GAP_PX - head), head };
      return Decoration.widget(at, lineGap(height, bands, across), {
        side: -1,
        ignoreSelection: true,
        key: `line:${height}:${across.left}:${across.width}:${head}`,
        inside: true,
      });
    });
    this.apply(DecorationSet.create(doc, decorations));
    this.tellPages(pagesOf(pagination, frameOf));
    if (count > 0 || !unchanged)
      debugLog('[text-document] layout', {
        pages: pageCount(pagination),
        measured: count,
        from: pagination.laidFrom,
        settled: pagination.settledAt,
        ms: Math.round((performance.now() - started) * 10) / 10,
      });

    function blockElements(v: EditorView, all: PmNode[], at: number[]) {
      // The body's children are its blocks and the spacers between them, in order.
      const children = [...v.dom.children].filter((c) => !c.classList.contains(PAGE_GAP_CLASS));
      const direct = children.length === all.length;
      return (i: number): HTMLElement => (direct ? children[i] : v.nodeDOM(at[i]!)) as HTMLElement;
    }
  }

  // Where block `start.block`'s line `start.line` starts, from the block's start: kept while the block is unchanged.
  private splitOffset(
    node: PmNode,
    pos: number,
    start: PageStart,
    metrics: BlockMetrics,
    elements: (i: number) => HTMLElement,
    ratio: number,
  ): number {
    let lines = this.splits.get(node);
    if (!lines) this.splits.set(node, (lines = new Map<number, number>()));
    const known = lines.get(start.line);
    if (known !== undefined) return known;
    const at =
      splitPosition(
        this.view,
        pos,
        node,
        elements(start.block),
        metrics.lines[start.line]!.top,
        ratio,
      ) - pos;
    lines.set(start.line, at);
    return at;
  }
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
        let mapped = set.map(tr.mapping, tr.doc);
        // A changed paragraph measures unbroken: its spacers go until it is laid out again.
        for (const pos of touchedParagraphs(tr)) {
          const node = tr.doc.nodeAt(pos)!;
          mapped = mapped.remove(
            mapped.find(pos, pos + node.nodeSize, (spec) => (spec as GapSpec).inside),
          );
        }
        return mapped;
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
