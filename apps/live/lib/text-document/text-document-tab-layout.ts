// Tabs drawn at their stops (docs/specs/034-text-documents/text-and-paragraphs.md "Tab stops"): each `\t` is drawn
// at no width, after a box whose width takes the text after it to the next stop, worked out from where the tab starts
// on its line. CSS draws tabs at one interval from the paragraph's edge only, so a layout pass sets each box's width
// and leader after the writing is drawn: only for paragraphs a change touched, and for all of them when the width,
// fonts or styles change. The boxes are widgets, whose changes the editor never reads back as edits.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import {
  Styles,
  TabStops,
  type ParagraphProps,
  type TabLeader,
  type TabStop,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import type { TextFormatting } from './text-document-formatting';

export const TAB_CLASS = 'text-document-tab';
export const TAB_CHARACTER_CLASS = 'text-document-tab-character';
// CSS pixels to points.
const PT_PER_PX = 0.75;

/** One tab as the layout pass sees it: where it starts and how much text follows it, in points; and its drawing. */
export type TabMeasure = {
  readonly start: () => number;
  readonly after: (stop: TabStop) => number;
  readonly draw: (width: number, leader: TabLeader | undefined) => void;
};

export type TabRules = {
  readonly stops: readonly TabStop[];
  readonly interval?: number;
  readonly hanging?: number;
};

/** Each tab of a paragraph in order, given the space to its stop; earlier tabs are drawn before later ones measure. */
export function layTabs(tabs: readonly TabMeasure[], rules: TabRules): void {
  for (const tab of tabs) {
    const x = tab.start();
    const stop = TabStops.next(rules.stops, x, rules);
    tab.draw(TabStops.width(stop, x, stop.align === 'start' ? 0 : tab.after(stop)), stop.leader);
  }
}

/** The stops, interval and hanging indent a paragraph draws its tabs with: its own over its style's. */
export function tabRulesOf(node: PmNode, formatting: TextFormatting): TabRules {
  const attrs = node.attrs as { style: string | null; props: ParagraphProps | null };
  const style = attrs.style ?? Styles.idOfRole(formatting.styles, 'normal');
  const props = {
    ...Styles.paragraphPropsOf(formatting.styles, formatting.defaults, style),
    ...attrs.props,
  };
  return {
    stops: props.tabStops ?? [],
    ...(props.tabInterval !== undefined ? { interval: props.tabInterval } : {}),
    ...(props.indentFirst !== undefined && props.indentFirst < 0
      ? { hanging: props.indentStart ?? 0 }
      : {}),
  };
}

// One box for every tab, the same widget so the editor keeps its element (and its width) as the writing moves.
const tabBox = (): HTMLElement => {
  const box = document.createElement('span');
  box.className = TAB_CLASS;
  box.setAttribute('aria-hidden', 'true');
  return box;
};

// The decorations of the tab characters inside `node`, which starts at `pos`: the box before each, then the character
// drawn at no width.
function tabsIn(node: PmNode, pos: number): Decoration[] {
  const decorations: Decoration[] = [];
  node.descendants((child, offset) => {
    if (!child.isText) return true;
    const text = child.text ?? '';
    const at = pos + 1 + offset;
    for (let i = text.indexOf('\t'); i !== -1; i = text.indexOf('\t', i + 1))
      decorations.push(
        Decoration.widget(at + i, tabBox, { side: 1, ignoreSelection: true }),
        Decoration.inline(at + i, at + i + 1, { class: TAB_CHARACTER_CLASS }),
      );
    return false;
  });
  return decorations;
}

/** A decoration on every tab character, which draws it as a box the layout pass sizes. */
export function tabDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, pos) => decorations.push(...tabsIn(node, pos)));
  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** The decorations after a change: mapped, and found again in the paragraphs it touched. */
function tabDecorationsAfter(
  previous: DecorationSet,
  tr: Transaction,
  touched: readonly number[],
): DecorationSet {
  let decorations = previous.map(tr.mapping, tr.doc);
  for (const pos of touched) {
    const node = tr.doc.nodeAt(pos)!;
    decorations = decorations
      .remove(decorations.find(pos, pos + node.nodeSize))
      .add(tr.doc, tabsIn(node, pos));
  }
  return decorations;
}

/** The paragraphs a transaction touched, by their position in its new document. */
export function touchedParagraphs(tr: Transaction): number[] {
  const out = new Set<number>();
  tr.mapping.maps.forEach((map, i) => {
    map.forEach((_from, _to, start, end) => {
      const rest = tr.mapping.slice(i + 1);
      const from = rest.map(start, -1);
      const to = Math.min(rest.map(end, 1), tr.doc.content.size);
      tr.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === 'paragraph') out.add(pos);
        return node.type.name !== 'paragraph';
      });
    });
  });
  return [...out];
}

type TabState = { decorations: DecorationSet; dirty: number[] | 'all' };

const key = new PluginKey<TabState>('textDocumentTabs');
// Meta: lay out every paragraph again (the styles changed).
const RELAY_ALL = 'relayAll';

function measureTabs(view: EditorView, pos: number, node: PmNode, scale: number, left: number) {
  const element = view.nodeDOM(pos);
  if (!(element instanceof HTMLElement)) return [];
  const boxes = [...element.querySelectorAll<HTMLElement>(`.${TAB_CLASS}`)];
  const tabs: number[] = [];
  node.forEach((child, offset) => {
    const text = child.text ?? '';
    for (let at = text.indexOf('\t'); at !== -1; at = text.indexOf('\t', at + 1))
      tabs.push(pos + 1 + offset + at);
  });
  if (boxes.length !== tabs.length) return [];
  const end = pos + node.nodeSize - 1;
  const ptAt = (px: number) => ((px - left) / scale) * PT_PER_PX;
  for (const box of boxes) box.style.width = '0px';
  return tabs.map((at, i): TabMeasure => {
    const box = boxes[i]!;
    return {
      start: () => ptAt(box.getBoundingClientRect().left),
      after: (stop) => {
        const segmentEnd = i + 1 < tabs.length ? tabs[i + 1]! : end;
        const text = view.state.doc.textBetween(at + 1, segmentEnd);
        const decimal = stop.align === 'decimal' ? text.indexOf(stop.char ?? '.') : -1;
        const until = decimal === -1 ? segmentEnd : at + 1 + decimal;
        const from = view.coordsAtPos(at + 1, 1);
        const to = view.coordsAtPos(until, -1);
        // Text that wraps to another line takes no space from the tab.
        if (Math.abs(to.top - from.top) > 1) return 0;
        return ((to.left - from.left) / scale) * PT_PER_PX;
      },
      draw: (width, leader) => {
        box.style.width = `${width / PT_PER_PX}px`;
        if (leader) box.dataset.leader = leader;
        else delete box.dataset.leader;
      },
    };
  });
}

/** Lays out the tabs of these paragraphs (every one holding a tab when `all`). */
function layOut(view: EditorView, which: number[] | 'all', readFormatting: () => TextFormatting) {
  const body = view.dom;
  const width = Number.parseFloat(getComputedStyle(body).width);
  const rect = body.getBoundingClientRect();
  // Hidden (a closed split, a tab not shown): nothing to measure; the next pass lays it out.
  if (!(width > 0) || rect.width === 0) return;
  const scale = rect.width / width;
  const formatting = readFormatting();
  const started = performance.now();
  const positions: number[] = [];
  if (which === 'all')
    view.state.doc.forEach((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent.includes('\t')) positions.push(pos);
    });
  else positions.push(...which);
  let tabs = 0;
  for (const pos of positions) {
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'paragraph' || !node.textContent.includes('\t')) continue;
    const measures = measureTabs(view, pos, node, scale, rect.left);
    tabs += measures.length;
    layTabs(measures, tabRulesOf(node, formatting));
  }
  if (which === 'all')
    debugLog('[text-document] tab layout', {
      paragraphs: positions.length,
      tabs,
      ms: Math.round(performance.now() - started),
    });
}

/** Lays out every paragraph's tabs again, after the styles change. */
export function relayTextDocumentTabs(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(key, RELAY_ALL).setMeta('addToHistory', false));
}

export function tabStopsPlugin(readFormatting: () => TextFormatting): Plugin<TabState> {
  return new Plugin<TabState>({
    key,
    state: {
      init: (_config, state) => ({ decorations: tabDecorations(state.doc), dirty: 'all' }),
      apply: (tr, previous) => {
        if (tr.getMeta(key) === RELAY_ALL) return { ...previous, dirty: 'all' };
        if (!tr.docChanged)
          return previous.dirty.length === 0 ? previous : { ...previous, dirty: [] };
        const touched = touchedParagraphs(tr);
        return {
          decorations: tabDecorationsAfter(previous.decorations, tr, touched),
          dirty: touched,
        };
      },
    },
    props: { decorations: (state) => key.getState(state)?.decorations },
    view: (view) => {
      const relay = () => layOut(view, 'all', readFormatting);
      relay();
      const resize = new ResizeObserver(relay);
      resize.observe(view.dom);
      document.fonts?.addEventListener('loadingdone', relay);
      return {
        update: (updated, previous) => {
          // Drawn again as it was (the editor's own redraw): nothing moved.
          if (updated.state === previous) return;
          const dirty = key.getState(updated.state)?.dirty ?? [];
          if (dirty === 'all' || dirty.length > 0) layOut(updated, dirty, readFormatting);
        },
        destroy: () => {
          resize.disconnect();
          document.fonts?.removeEventListener('loadingdone', relay);
        },
      };
    },
  });
}
