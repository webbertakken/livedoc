// Several stretches of text selected at once (docs/specs/034-text-documents/text-and-paragraphs.md "Selection"): kept
// with Ctrl⌘⇧← / → (Ctrl+Alt+Shift elsewhere) or ⌘-drag (Ctrl-drag), or found by Select all matching text. Formatting
// and Delete act on every stretch (their commands read every range); typing, Enter, Tab and Paste act at the last
// stretch alone. The browser draws one selection, so the stretches are drawn by decorations and announced.
import {
  Fragment,
  Slice,
  type Mark,
  type Node as PmNode,
  type ResolvedPos,
} from 'prosemirror-model';
import {
  Plugin,
  PluginKey,
  Selection,
  SelectionRange,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { FORMATTING_MARKS } from './text-document-format-copy';

/** The registry row the plugin answers itself: its keys carry a direction no menu item has. */
export const STRETCH_KEY_ROW = 'select-multiple-sections-of-text';
export const SELECT_MATCHING_ITEM = 'select-all-matching-text';

const STRETCH_CLASS = 'text-document-stretch';
const CARET_CLASS = 'text-document-stretch-caret';

/** Several stretches: every range kept, the last the one the keys move (its anchor and head). */
export class StretchSelection extends Selection {
  constructor($anchor: ResolvedPos, $head: ResolvedPos, held: readonly SelectionRange[]) {
    const active = new SelectionRange($anchor.min($head), $anchor.max($head));
    super($anchor, $head, [...held, active]);
  }

  /** The stretches kept before the one the keys move. */
  get held(): readonly SelectionRange[] {
    return this.ranges.slice(0, -1);
  }

  /** Stretches from ranges in order, the last moved by the keys; one alone is a text selection. */
  static of(
    doc: PmNode,
    ranges: readonly { from: number; to: number }[],
    last?: { anchor: number; head: number },
  ) {
    const given = ranges.filter((r) => r.to > r.from);
    const active =
      last ?? (given.at(-1) ? { anchor: given.at(-1)!.from, head: given.at(-1)!.to } : null);
    if (!active) return null;
    const rest = given.filter(
      (r) =>
        !(
          r.from === Math.min(active.anchor, active.head) &&
          r.to === Math.max(active.anchor, active.head)
        ),
    );
    if (rest.length === 0) return TextSelection.create(doc, active.anchor, active.head);
    return new StretchSelection(
      doc.resolve(active.anchor),
      doc.resolve(active.head),
      rest.map((r) => new SelectionRange(doc.resolve(r.from), doc.resolve(r.to))),
    );
  }

  override map(doc: PmNode, mapping: Parameters<Selection['map']>[1]): Selection {
    const held = this.held
      .map((r) => ({ from: mapping.map(r.$from.pos, 1), to: mapping.map(r.$to.pos, -1) }))
      .filter((r) => r.to > r.from);
    const anchor = mapping.map(this.anchor);
    const head = mapping.map(this.head);
    if (held.length === 0) return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
    return new StretchSelection(
      doc.resolve(anchor),
      doc.resolve(head),
      held.map((r) => new SelectionRange(doc.resolve(r.from), doc.resolve(r.to))),
    );
  }

  override eq(other: Selection): boolean {
    return (
      other instanceof StretchSelection &&
      other.anchor === this.anchor &&
      other.head === this.head &&
      other.ranges.length === this.ranges.length &&
      other.ranges.every(
        (r, i) =>
          r.$from.pos === this.ranges[i]!.$from.pos && r.$to.pos === this.ranges[i]!.$to.pos,
      )
    );
  }

  override toJSON() {
    return {
      type: 'stretches',
      anchor: this.anchor,
      head: this.head,
      held: this.held.map((r) => [r.$from.pos, r.$to.pos]),
    };
  }

  static override fromJSON(
    doc: PmNode,
    json: { anchor: number; head: number; held: [number, number][] },
  ) {
    return new StretchSelection(
      doc.resolve(json.anchor),
      doc.resolve(json.head),
      json.held.map(([from, to]) => new SelectionRange(doc.resolve(from), doc.resolve(to))),
    );
  }

  /** The stretches in order, each from a new line: a paragraph of its own text, or the paragraphs it spans. */
  override content(): Slice {
    const doc = this.$anchor.doc;
    const nodes: PmNode[] = [];
    for (const { $from, $to } of [...this.ranges].sort((a, b) => a.$from.pos - b.$from.pos)) {
      if ($from.pos === $to.pos) continue;
      doc.slice($from.pos, $to.pos).content.forEach((node) => {
        nodes.push(
          node.isTextblock ? node : doc.resolve($from.pos).parent.copy(Fragment.from(node)),
        );
      });
    }
    return new Slice(Fragment.from(nodes), 1, 1);
  }
}
Selection.jsonID('stretches', StretchSelection);
// The browser's own selection is not drawn: the stretches are.
StretchSelection.prototype.visible = false;

/** The last stretch alone, as a text selection. */
export const lastStretch = (selection: StretchSelection): TextSelection =>
  TextSelection.create(selection.$anchor.doc, selection.anchor, selection.head);

const formattingOf = (marks: readonly Mark[]) =>
  marks.filter((m) => FORMATTING_MARKS.has(m.type.name));
const sameFormatting = (a: readonly Mark[], b: readonly Mark[]) =>
  a.length === b.length && a.every((m) => m.isInSet(b));
const styleOf = (paragraph: PmNode) => (paragraph.attrs as { style: string | null }).style ?? null;

/**
 * Select all matching text: every stretch with the text formatting where the selection starts (or at the caret), in
 * a paragraph of the same style; declines when the document has none.
 */
export const selectMatching: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const marks = formattingOf(
    empty ? (state.storedMarks ?? $from.marks()) : ($from.nodeAfter?.marks ?? $from.marks()),
  );
  const style = styleOf($from.parent);
  const ranges: { from: number; to: number }[] = [];
  state.doc.descendants((node, pos, parent) => {
    if (!node.isText) return !node.isTextblock || styleOf(node) === style;
    if (!parent || !sameFormatting(formattingOf(node.marks), marks)) return false;
    const last = ranges.at(-1);
    if (last && last.to === pos) last.to = pos + node.nodeSize;
    else ranges.push({ from: pos, to: pos + node.nodeSize });
    return false;
  });
  const selection = StretchSelection.of(state.doc, ranges);
  if (!selection) return false;
  if (dispatch) {
    dispatch(state.tr.setSelection(selection));
    track('UI', 'Used', 'TextDocumentSelectMatching');
    debugLog('[text-document] stretches', { count: ranges.length, by: 'matching' });
  }
  return true;
};

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** Ctrl⌘⇧← / → on a Mac, Ctrl+Alt+Shift+← / → elsewhere: the side the next caret goes to, else null. */
export function stretchKeyOf(event: KeyboardEvent, mac = isMac()): -1 | 1 | null {
  const mods = mac
    ? event.ctrlKey && event.metaKey && event.shiftKey && !event.altKey
    : event.ctrlKey && event.altKey && event.shiftKey && !event.metaKey;
  if (!mods) return null;
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : null;
}

/** A position a character to `dir` in the writing, where text can stand. */
function step(doc: PmNode, pos: number, dir: -1 | 1): number {
  const next = Math.min(doc.content.size, Math.max(0, pos + dir));
  return Selection.findFrom(doc.resolve(next), dir, true)?.head ?? pos;
}

/**
 * The selection as the browser holds it now: keys that move the browser's caret (Shift+→) reach the editor on the next
 * selectionchange, which may come after the next key. Several stretches are the editor's own, never the browser's.
 */
function browserSelection(view: EditorView): Selection {
  const { selection, doc } = view.state;
  const dom = view.dom.ownerDocument.getSelection();
  if (selection instanceof StretchSelection || !dom?.anchorNode || !dom.focusNode) return selection;
  if (!view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return selection;
  try {
    const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset);
    const head = view.posAtDOM(dom.focusNode, dom.focusOffset);
    return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
  } catch {
    return selection;
  }
}

/** The ranges kept, and a new caret a character to `dir` from where the last one ends. */
function addStretch(state: EditorState, dir: -1 | 1, now: Selection): Transaction | null {
  const selection = now;
  // The stretch the keys move: the last one's anchor and head (a selection's ranges start with those held).
  const { $anchor, $head } = selection;
  const active =
    $anchor.pos === $head.pos ? [] : [new SelectionRange($anchor.min($head), $anchor.max($head))];
  const held = [...(selection instanceof StretchSelection ? selection.held : []), ...active];
  if (held.length === 0) return null;
  const side = dir < 0 ? Math.min($anchor.pos, $head.pos) : Math.max($anchor.pos, $head.pos);
  const caret = state.doc.resolve(step(state.doc, side, dir));
  return state.tr.setSelection(new StretchSelection(caret, caret, held));
}

/** The keys' stretch moved: its head a character (Left, Right) or a line (Up, Down), its anchor too without Shift. */
function moveStretch(
  view: EditorView,
  selection: StretchSelection,
  event: KeyboardEvent,
): Transaction | null {
  const { doc } = view.state;
  let head: number | null = null;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    head = step(doc, selection.head, event.key === 'ArrowLeft' ? -1 : 1);
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const at = view.coordsAtPos(selection.head);
    const line = Math.max(1, at.bottom - at.top);
    const found = view.posAtCoords({
      left: at.left,
      top: event.key === 'ArrowUp' ? at.top - line / 2 : at.bottom + line / 2,
    });
    head = found ? found.pos : selection.head;
  }
  if (head === null) return null;
  const anchor = event.shiftKey ? selection.anchor : head;
  return view.state.tr.setSelection(
    new StretchSelection(doc.resolve(anchor), doc.resolve(head), selection.held),
  );
}

const key = new PluginKey<DecorationSet>('textDocumentStretches');

function stretchDecorations(state: EditorState): DecorationSet {
  const { selection, doc } = state;
  if (!(selection instanceof StretchSelection)) return DecorationSet.empty;
  const decorations = selection.ranges.flatMap(({ $from, $to }) =>
    $from.pos === $to.pos ? [] : [Decoration.inline($from.pos, $to.pos, { class: STRETCH_CLASS })],
  );
  if (selection.empty)
    decorations.push(
      Decoration.widget(
        selection.head,
        (view) => {
          const caret = view.dom.ownerDocument.createElement('span');
          caret.className = CARET_CLASS;
          caret.setAttribute('aria-hidden', 'true');
          return caret;
        },
        { key: 'stretch-caret', side: 1 },
      ),
    );
  return DecorationSet.create(doc, decorations);
}

const count = (selection: Selection) =>
  selection.ranges.filter((r) => r.$from.pos !== r.$to.pos).length;

/** Several stretches: their keys, the pointer's ⌘-drag, their drawing and their announcement. */
export function stretchesPlugin(): Plugin {
  // The stretches a ⌘-drag adds to: from its press to the next press or key.
  let held: readonly SelectionRange[] | null = null;
  return new Plugin({
    key,
    state: {
      init: (_config, state) => stretchDecorations(state),
      apply: (tr, set, _old, state) =>
        tr.selectionSet || tr.docChanged ? stretchDecorations(state) : set,
    },
    appendTransaction: (transactions, _old, state) => {
      const { selection } = state;
      // Only the pointer's own selection is added: the browser's, read as the drag goes.
      const byPointer = transactions.some((tr) => tr.selectionSet && tr.getMeta('pointer'));
      if (!held || !byPointer || selection instanceof StretchSelection) return null;
      if (selection.empty) return null;
      const doc = state.doc;
      const kept = held
        .map((r) => ({
          from: Math.min(r.$from.pos, doc.content.size),
          to: Math.min(r.$to.pos, doc.content.size),
        }))
        .filter((r) => r.to > r.from);
      return state.tr.setSelection(
        new StretchSelection(
          selection.$anchor,
          selection.$head,
          kept.map((r) => new SelectionRange(doc.resolve(r.from), doc.resolve(r.to))),
        ),
      );
    },
    props: {
      decorations: (state) => key.getState(state),
      handleKeyDown: (view, event) => {
        held = null;
        const { selection } = view.state;
        const dir = stretchKeyOf(event);
        if (dir !== null) {
          const tr = addStretch(view.state, dir, browserSelection(view));
          if (!tr) return false;
          view.dispatch(tr.scrollIntoView());
          track('UI', 'Used', 'TextDocumentStretches');
          debugLog('[text-document] stretches', { count: count(tr.selection), by: 'keys' });
          return true;
        }
        if (!(selection instanceof StretchSelection)) return false;
        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setSelection(lastStretch(selection)));
          return true;
        }
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          const tr = moveStretch(view, selection, event);
          if (tr) {
            view.dispatch(tr.scrollIntoView());
            return true;
          }
        }
        // Enter and Tab act at the last stretch alone; the others let go.
        if (event.key === 'Enter' || event.key === 'Tab')
          view.dispatch(view.state.tr.setSelection(lastStretch(selection)));
        return false;
      },
      // Typing acts at the last stretch alone.
      handleTextInput: (view, _from, _to, text) => {
        const { selection } = view.state;
        if (!(selection instanceof StretchSelection)) return false;
        view.dispatch(
          view.state.tr.setSelection(lastStretch(selection)).insertText(text).scrollIntoView(),
        );
        return true;
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          const adding = isMac() ? event.metaKey : event.ctrlKey;
          if (!adding || view.state.selection.empty) {
            held = null;
            return false;
          }
          held = view.state.selection.ranges.filter((r) => r.$from.pos !== r.$to.pos);
          track('UI', 'Used', 'TextDocumentStretches');
          return false;
        },
      },
      // A ⌘-click while adding never selects the paragraph around it.
      handleClick: () => held !== null,
    },
    view: (view) => {
      const region = view.dom.ownerDocument.createElement('div');
      region.setAttribute('role', 'status');
      region.className = 'sr-only';
      view.dom.parentElement?.append(region);
      let shown = 0;
      return {
        update: (next) => {
          const now =
            next.state.selection instanceof StretchSelection ? count(next.state.selection) : 0;
          if (now === shown) return;
          shown = now;
          region.textContent = now > 1 ? `${now} stretches selected` : '';
        },
        destroy: () => region.remove(),
      };
    },
  });
}
