// Suggesting (docs/specs/034-text-documents/review.md "Suggesting", "While suggesting"): a transaction the editor would
// apply is rewritten as suggestions before it is. Typed text is inserted marked as the person's insertion, after any
// text it replaces; deleted text stays, marked deleted, unless it is their own suggested text, which goes; Enter and
// Backspace across paragraphs suggest a break and a join; formatting suggests a format change keeping what was before;
// a paragraph's style, formatting or list a paragraph format change. One person's change next to their own earlier one
// is the same suggestion. Pure: the state and transaction in, a transaction or a refusal out.
import type { Mark, Node as PmNode } from 'prosemirror-model';
import {
  NodeSelection,
  TextSelection,
  type EditorState,
  type Transaction,
} from 'prosemirror-state';
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceStep } from 'prosemirror-transform';
import {
  DELETION_MARK,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  PARAGRAPH_FORMAT_CHANGE,
  RUN_KEPT_MARK,
  RUN_MARKS,
  type SuggestionMark,
} from '@livedoc/text-documents';
import {
  insideContents,
  insideOwnBlock,
  isOwn,
  isStructure,
  isTablePart,
  isWholeBlock,
  ownBlockAround,
  selectionInBlock,
} from './text-document-suggesting-blocks';
import {
  crossed,
  insideOwnPart,
  isTableParts,
  ownPartChange,
  reshapesOthers,
} from './text-document-suggesting-tables';
import {
  loneObject,
  objectChange,
  PARAGRAPH_FORMAT_ATTRIBUTES,
  paragraphMarkup,
} from './text-document-suggesting-steps';

/** Who suggests: their key, name and colour, the time, and a fresh id for a new suggestion. */
export type Suggester = {
  readonly key: string;
  readonly name: string;
  readonly colour: string;
  readonly now: number;
  readonly newId: () => string;
};

/** Why a change cannot be a suggestion (yet): its structure, or formatting someone else has suggested a change to. */
export type SuggestingRefusal = 'structure' | 'others-format';

export type SuggestingResult =
  | { readonly tr: Transaction; readonly made: readonly string[] }
  | { readonly refused: SuggestingRefusal };

/** The marks a format suggestion covers: a run's formatting, never what a file kept. */
const FORMATTING_MARKS = new Set<string>(RUN_MARKS.filter((m) => m !== RUN_KEPT_MARK));
/** The metas a rewritten transaction keeps. */
const KEPT_METAS = ['addToHistory', 'uiEvent', 'paste', 'composition'] as const;
const PARAGRAPH = 'paragraph';

type Attrs = Record<string, unknown>;

const markOf = (marks: readonly Mark[], name: string): Attrs | undefined =>
  marks.find((m) => m.type.name === name)?.attrs;

/** The suggestion parts of a text node or inline atom carry: its marks for text, its attributes for an atom. */
function partsOf(node: PmNode): Attrs {
  if (node.isText)
    return {
      [INSERTION_MARK]: markOf(node.marks, INSERTION_MARK),
      [DELETION_MARK]: markOf(node.marks, DELETION_MARK),
      [FORMAT_CHANGE_MARK]: markOf(node.marks, FORMAT_CHANGE_MARK),
    };
  return node.attrs;
}

/** The sender's own suggestion touching a range, to join: its id, time and author. */
function ownNear(doc: PmNode, from: number, to: number, key: string): SuggestionMark | undefined {
  const near: PmNode[] = [];
  const $from = doc.resolve(Math.max(0, Math.min(from, doc.content.size)));
  const $to = doc.resolve(Math.max(0, Math.min(to, doc.content.size)));
  // Text and objects either side; a paragraph only where its start (its break or join) lies in the range.
  // Text and objects either side; rows or cells either side too, so rows added one after another join.
  for (const n of [$from.nodeBefore, $from.nodeAfter, $to.nodeBefore, $to.nodeAfter])
    if (n?.isInline || (n && isTablePart(n))) near.push(n);
  if (from < to)
    doc.nodesBetween(from, to, (n, pos) => {
      if (n.isInline || pos >= from) near.push(n);
    });
  // One's own suggested block around it: writing there is part of that block's suggestion.
  const block = ownBlockAround(doc, from, key);
  if (block) near.push(block.node);
  for (const node of near) {
    const parts = partsOf(node);
    for (const name of [
      INSERTION_MARK,
      DELETION_MARK,
      FORMAT_CHANGE_MARK,
      PARAGRAPH_FORMAT_CHANGE,
    ]) {
      const value = parts[name];
      if (isOwn(value, key)) return { id: value.id, at: value.at, author: value.author };
    }
  }
  return undefined;
}

class Rewriter {
  readonly out: Transaction;
  readonly who: Suggester;
  readonly made = new Set<string>();
  /** Where the first whole block put in starts, and the steps after which that holds; none put in yet. */
  placedBlock: { pos: number; after: number } | undefined;
  /** Whether a row or cell was suggested deleted, so the caret stays where it was. */
  partDeleted = false;
  #base: SuggestionMark | undefined;

  constructor(state: EditorState, who: Suggester) {
    this.out = state.tr;
    this.who = who;
  }

  get schema() {
    return this.out.doc.type.schema;
  }

  /** The mark this step's parts carry: the sender's own touching suggestion, else a new one. */
  base(from: number, to: number): SuggestionMark {
    if (this.#base) return this.#base;
    const near = ownNear(this.out.doc, from, to, this.who.key);
    this.#base = near ?? {
      id: this.who.newId(),
      at: this.who.now,
      author: { key: this.who.key, name: this.who.name, colour: this.who.colour },
    };
    if (!near) this.made.add(this.#base.id);
    return this.#base;
  }

  markType(name: string) {
    return this.schema.marks[name]!;
  }

  /** Marks `[from, to)` deleted, removing the sender's own suggested text and joining their own breaks. */
  delete(from: number, to: number): SuggestingRefusal | null {
    if (from >= to) return null;
    const doc = this.out.doc;
    let refused: SuggestingRefusal | null = null;
    type Action =
      | { pos: number; kind: 'remove'; to: number }
      | { pos: number; kind: 'mark'; to: number }
      | { pos: number; kind: 'atom'; node: PmNode }
      | { pos: number; kind: 'block'; node: PmNode }
      | { pos: number; kind: 'join'; node: PmNode };
    const actions: Action[] = [];
    doc.nodesBetween(from, to, (node, pos) => {
      if (refused) return false;
      if (isStructure(node)) {
        refused = 'structure';
        return false;
      }
      // A whole block covered is suggested deleted whole (one's own taken away); one partly covered is gone into.
      if (isWholeBlock(node) && pos >= from && pos + node.nodeSize <= to) {
        if (isOwn(node.attrs[INSERTION_MARK], this.who.key))
          actions.push({ pos, kind: 'remove', to: pos + node.nodeSize });
        else if (!node.attrs[DELETION_MARK]) actions.push({ pos, kind: 'block', node });
        return false;
      }
      // A whole row or cell of a table not wholly covered: suggested deleted (one's own taken away), unless a merged
      // cell crosses it (not yet).
      if (isTablePart(node) && pos >= from && pos + node.nodeSize <= to) {
        if (crossed(doc, pos, node)) refused = 'structure';
        else if (isOwn(node.attrs[INSERTION_MARK], this.who.key))
          actions.push({ pos, kind: 'remove', to: pos + node.nodeSize });
        else if (!node.attrs[DELETION_MARK]) {
          actions.push({ pos, kind: 'block', node });
          this.partDeleted = true;
        }
        return false;
      }
      if (isWholeBlock(node) || isTablePart(node)) return true;
      if (node.type.name === PARAGRAPH) {
        if (pos >= from && pos < to) actions.push({ pos, kind: 'join', node });
        return true;
      }
      if (!node.isInline) return true;
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      const parts = partsOf(node);
      if (isOwn(parts[INSERTION_MARK], this.who.key))
        actions.push({ pos: start, kind: 'remove', to: end });
      else if (parts[DELETION_MARK]) return false;
      else if (node.isText) actions.push({ pos: start, kind: 'mark', to: end });
      else actions.push({ pos, kind: 'atom', node });
      return false;
    });
    if (refused) return refused;
    const mark = this.base(from, to);
    for (const action of actions.sort((a, b) => b.pos - a.pos)) {
      if (action.kind === 'remove') this.out.delete(action.pos, action.to);
      else if (action.kind === 'mark')
        this.out.addMark(action.pos, action.to, this.markType(DELETION_MARK).create(mark));
      else if (action.kind === 'atom' || action.kind === 'block')
        this.out.setNodeMarkup(action.pos, undefined, {
          ...action.node.attrs,
          [DELETION_MARK]: mark,
        });
      else {
        const $pos = this.out.doc.resolve(action.pos);
        const before = $pos.nodeBefore;
        const ownBreak = isOwn(action.node.attrs[INSERTION_MARK], this.who.key);
        if (ownBreak && before?.type.name === PARAGRAPH) this.out.join(action.pos);
        else if (before?.type.name === PARAGRAPH && !action.node.attrs[DELETION_MARK])
          this.out.setNodeMarkup(action.pos, undefined, {
            ...action.node.attrs,
            [DELETION_MARK]: mark,
          });
      }
    }
    return null;
  }

  /** Marks what was just inserted in `[from, to)` as the sender's insertion, its new paragraphs as suggested breaks. */
  inserted(from: number, to: number): void {
    if (from >= to) return;
    const mark = this.base(from, to);
    const schema = this.schema;
    for (const name of [DELETION_MARK, FORMAT_CHANGE_MARK, INSERTION_MARK])
      this.out.removeMark(from, to, schema.marks[name]);
    // A whole block, row or cell put in carries the insertion itself; what is inside it is not marked.
    const blocks: { pos: number; node: PmNode }[] = [];
    this.out.doc.nodesBetween(from, to, (node, pos) => {
      if ((isWholeBlock(node) || isTablePart(node)) && pos >= from && pos + node.nodeSize <= to) {
        blocks.push({ pos, node });
        return false;
      }
      return !node.isInline;
    });
    let start = from;
    for (const { pos, node } of [...blocks, { pos: to, node: null }]) {
      if (pos > start) this.out.addMark(start, pos, schema.marks[INSERTION_MARK]!.create(mark));
      start = node ? pos + node.nodeSize : start;
    }
    const whole = blocks.find((b) => isWholeBlock(b.node));
    if (whole && !this.placedBlock)
      this.placedBlock = { pos: whole.pos, after: this.out.steps.length };
    const marked: { pos: number; node: PmNode; paragraph: boolean }[] = blocks.map((b) => ({
      ...b,
      paragraph: false,
    }));
    this.out.doc.nodesBetween(from, to, (node, pos) => {
      if (blocks.some((b) => b.pos === pos)) return false;
      if (node.type.name === PARAGRAPH) {
        if (pos >= from && pos < to) marked.push({ pos, node, paragraph: true });
        return true;
      }
      if (node.isInline && !node.isText) marked.push({ pos, node, paragraph: false });
      return !node.isInline;
    });
    for (const { pos, node, paragraph } of marked)
      this.out.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        [INSERTION_MARK]: mark,
        [DELETION_MARK]: null,
        ...(paragraph ? { [PARAGRAPH_FORMAT_CHANGE]: null } : {}),
      });
  }

  /** A formatting change over `[from, to)`: the sender's own suggested text formatted, other text a format change. */
  format(
    from: number,
    to: number,
    change: (from: number, to: number) => void,
    name: string,
  ): SuggestingRefusal | null {
    if (!FORMATTING_MARKS.has(name)) {
      change(from, to);
      return null;
    }
    const pieces: { from: number; to: number; node: PmNode }[] = [];
    let refused: SuggestingRefusal | null = null;
    this.out.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText) return true;
      const existing = markOf(node.marks, FORMAT_CHANGE_MARK);
      if (existing && !isOwn(existing, this.who.key)) refused = 'others-format';
      pieces.push({ from: Math.max(pos, from), to: Math.min(pos + node.nodeSize, to), node });
      return false;
    });
    if (refused) return refused;
    const mark = this.base(from, to);
    for (const piece of pieces) {
      if (isOwn(markOf(piece.node.marks, INSERTION_MARK), this.who.key)) {
        change(piece.from, piece.to);
        continue;
      }
      const existing = markOf(piece.node.marks, FORMAT_CHANGE_MARK) as
        (SuggestionMark & { before?: Attrs }) | undefined;
      const before: Attrs = { ...(existing?.before ?? {}) };
      if (!(name in before)) before[name] = markOf(piece.node.marks, name) ?? null;
      change(piece.from, piece.to);
      this.out.addMark(
        piece.from,
        piece.to,
        this.markType(FORMAT_CHANGE_MARK).create({ ...(existing ?? mark), before }),
      );
    }
    return null;
  }

  /** A paragraph's new style, formatting or list, as a paragraph format change unless it is the sender's own new one. */
  paragraphFormat(pos: number, attrs: Attrs): void {
    const node = this.out.doc.nodeAt(pos)!;
    if (isOwn(node.attrs[INSERTION_MARK], this.who.key)) {
      this.out.setNodeMarkup(pos, undefined, attrs);
      return;
    }
    const existing = node.attrs[PARAGRAPH_FORMAT_CHANGE] as unknown;
    const before = isOwn(existing, this.who.key)
      ? (existing as SuggestionMark & { before: Attrs }).before
      : Object.fromEntries(PARAGRAPH_FORMAT_ATTRIBUTES.map((a) => [a, node.attrs[a] ?? null]));
    const mark = isOwn(existing, this.who.key) ? existing : this.base(pos, pos + node.nodeSize);
    this.out.setNodeMarkup(pos, undefined, {
      ...attrs,
      [PARAGRAPH_FORMAT_CHANGE]: { id: mark.id, at: mark.at, author: mark.author, before },
    });
  }
}

/**
 * `tr` rewritten as `who`'s suggestions on `state`, or why it cannot be. Each step is replayed in order against the
 * new transaction, its positions mapped from the document it was made on.
 */
export function suggestTransaction(
  state: EditorState,
  tr: Transaction,
  who: Suggester,
): SuggestingResult {
  const rewriter = new Rewriter(state, who);
  const out = rewriter.out;
  // From the document each original step was made on to the new transaction's.
  let into = new Mapping();
  let caret: number | undefined;
  // A lone object put in: where it stands, and the steps after which that holds, to leave it selected.
  let placed: { pos: number; after: number } | undefined;
  // Whether every step changed one of the person's own suggested objects in place, so the transaction stands as it is.
  let ownObjectsOnly = true;
  // Moving, sorting, distributing, merging or splitting anyone else's table: not yet.
  if (reshapesOthers(tr, who.key)) return { refused: 'structure' };
  for (const [i, step] of tr.steps.entries()) {
    const doc = tr.docs[i]!;
    const at = out.steps.length;
    const map = (pos: number, assoc = 1) => into.map(pos, assoc);
    let refused: SuggestingRefusal | null = null;
    // Inside one's own suggested block, any change is plainly part of it; so is writing in one's own suggested row or
    // cell, and a change to the look of a row or cell one's own suggestion put in.
    const ownBlock = insideOwnBlock(step, doc, who.key) || insideOwnPart(step, doc, who.key);
    const ownPart = ownBlock ? null : ownPartChange(step, into, out, who.key);
    const markup = ownBlock ? null : paragraphMarkup(step, doc);
    const object = markup || ownBlock ? null : objectChange(step, doc);
    if (!object && !ownBlock) ownObjectsOnly = false;
    if (ownPart) {
      ownObjectsOnly = false;
      ownPart();
    } else if (ownBlock) {
      const mapped = step.map(into);
      if (!mapped || out.maybeStep(mapped).failed) refused = 'structure';
    } else if (insideContents(step, doc)) refused = 'structure';
    else if (markup) rewriter.paragraphFormat(map(markup.pos), markup.attrs);
    else if (object) {
      // One's own suggested object changes plainly, part of its suggestion; anyone else's never.
      const mapped = isOwn(object.node.attrs[INSERTION_MARK], who.key) ? step.map(into) : null;
      if (!mapped || out.maybeStep(mapped).failed) refused = 'structure';
    } else if (step instanceof ReplaceStep) {
      const from = map(step.from, -1);
      const to = map(step.to, 1);
      // A kept block never; a table's rows or cells only whole, as a row's or column's insertion.
      let structural = false;
      if (!isTableParts(step))
        step.slice.content.forEach((node) => {
          if (isTablePart(node)) structural = true;
        });
      step.slice.content.descendants((node) => {
        if (isStructure(node)) structural = true;
        return !structural;
      });
      refused = structural ? 'structure' : rewriter.delete(from, to);
      if (!refused && step.slice.size > 0) {
        const point = out.mapping.slice(at).map(to, 1);
        // Its suggestion chosen from what stands either side before it goes in, never from what the slice copied.
        rewriter.base(point, point);
        const before = out.steps.length;
        out.replace(point, point, step.slice);
        const end = out.mapping.slice(before).map(point, 1);
        rewriter.inserted(point, end);
        caret = out.mapping.slice(before).map(point, 1);
        if (loneObject(step))
          placed = { pos: out.mapping.slice(before).map(point, -1), after: out.steps.length };
      } else if (!refused) {
        const head = state.selection.head;
        const backwards = state.selection.empty && tr.steps.length === 1 && head === step.to;
        caret = backwards ? out.mapping.slice(at).map(from, -1) : out.mapping.slice(at).map(to, 1);
      }
    } else if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
      const from = map(step.from, 1);
      const to = map(step.to, -1);
      const add = step instanceof AddMarkStep;
      refused = rewriter.format(
        from,
        to,
        (a, b) => (add ? out.addMark(a, b, step.mark) : out.removeMark(a, b, step.mark)),
        step.mark.type.name,
      );
    } else refused = 'structure';
    if (refused) return { refused };
    // The original step's own map taken back, then what the rewrite did: the next step's positions in the new doc.
    into = new Mapping([step.getMap().invert(), ...into.maps, ...out.mapping.maps.slice(at)]);
  }
  // Positions unchanged, so what the transaction carries for plugins (an equation box's caret) still holds.
  if (ownObjectsOnly) return { tr, made: [] };
  for (const meta of KEPT_METAS) {
    const value = tr.getMeta(meta) as unknown;
    if (value !== undefined) out.setMeta(meta, value);
  }
  const selected = tr.selection instanceof NodeSelection ? tr.selection.node : null;
  const at = placed && out.mapping.slice(placed.after).map(placed.pos, 1);
  // A whole block put in: the selection the command chose in it (a table's first cell, the table of contents itself).
  const inBlock = rewriter.placedBlock && tr.selectionSet ? selectionInBlock(tr) : null;
  if (inBlock && rewriter.placedBlock) {
    const start = out.mapping.slice(rewriter.placedBlock.after).map(rewriter.placedBlock.pos, 1);
    out.setSelection(
      inBlock.node
        ? NodeSelection.create(out.doc, start)
        : TextSelection.create(out.doc, start + inBlock.offset),
    );
  } else if (rewriter.partDeleted)
    // A row or column suggested deleted stays: the caret stays where it was in it.
    out.setSelection(state.selection.map(out.doc, out.mapping));
  else if (selected && at !== undefined && out.doc.nodeAt(at)?.type === selected.type)
    out.setSelection(NodeSelection.create(out.doc, at));
  else if (caret !== undefined)
    out.setSelection(
      TextSelection.create(out.doc, Math.max(0, Math.min(caret, out.doc.content.size))),
    );
  return { tr: out, made: [...rewriter.made] };
}
