// A comparison's steps built back into blocks (review.md "Compare documents", "What is compared"): the kept read as the
// selected document has them, the primary's alone as suggested deletions and joins, the selected's alone as suggested
// insertions and breaks, formatting that differs as format suggestions holding the primary's. One stretch of
// differences between two kept tokens is one suggestion; each run of format changes, and each paragraph's, its own.
import type { Block, Inline, Paragraph, Run } from '../model/blocks';
import type { CommentMark } from '../model/comments';
import type { FileSuggestionMark } from '../model/suggestions';
import type { Table } from '../model/tables';
import { stableKey, type CompareToken } from './compare-tokens';

/** One step of a comparison: a token of both, of the primary alone, or of the selected alone. */
export type TokenOp =
  | { readonly kind: 'same'; readonly p: CompareToken; readonly s: CompareToken }
  | { readonly kind: 'delete'; readonly p: CompareToken }
  | { readonly kind: 'insert'; readonly s: CompareToken };

/** What a comparison carries through its parts: the marks it makes, and what it leaves out. */
export type CompareContext = {
  /** A new suggestion's mark. */
  readonly mark: () => FileSuggestionMark;
  /** Two tables paired: their rows compared, or the one deleted and the other inserted. */
  readonly tables: (primary: Table, selected: Table) => Block[];
  /** Counts a block the model cannot mark, left out. */
  readonly leaveOut: () => void;
};

// A paragraph being built; the run last pushed, its source run and what marks it, so the next word of the same run
// and marks joins it rather than making a run of its own.
type Open = { paragraph: Paragraph; inlines: Inline[]; last: { source: Run; tag: string } | null };

const sameFormatting = (a: Run, b: Run) =>
  a.style === b.style && stableKey(a.props) === stableKey(b.props);

const plainParagraph = (paragraph: Paragraph): Paragraph => {
  const { suggested: _, ...rest } = paragraph;
  return { ...rest, inlines: [] };
};

/** The steps built into blocks; the selected's comment edges after its last token at the end. */
export function buildBlocks(
  ops: readonly TokenOp[],
  trailing: readonly CommentMark[],
  ctx: CompareContext,
): Block[] {
  const out: Block[] = [];
  let open: Open | null = null;
  let stretch: FileSuggestionMark | null = null;
  let format: FileSuggestionMark | null = null;
  const stretchMark = () => (stretch ??= ctx.mark());
  const close = () => {
    if (open) out.push({ ...open.paragraph, inlines: open.inlines });
    open = null;
  };
  const carry = (comments: readonly CommentMark[]) => {
    if (!open || comments.length === 0) return;
    open.inlines.push(...comments);
    open.last = null;
  };
  const push = (inline: Inline) => {
    if (!open) return;
    open.inlines.push(inline);
    open.last = null;
  };
  /** A word of `source` pushed, joining the run before when it is of the same source and marks (`tag`). */
  const word = (source: Run, text: string, tag: string, suggested?: Run['suggested']) => {
    if (!open) return;
    const index = open.inlines.length - 1;
    const last = open.inlines[index];
    if (open.last && open.last.source === source && open.last.tag === tag && last?.type === 'run') {
      open.inlines[index] = { ...last, text: last.text + text };
      return;
    }
    const { suggested: _, ...plain } = source;
    open.inlines.push(suggested ? { ...plain, text, suggested } : { ...plain, text });
    open.last = { source, tag };
  };

  for (const op of ops) {
    if (op.kind === 'same') stretch = null;
    if (op.kind !== 'same' || op.p.kind !== 'text') format = null;
    if (op.kind !== 'delete') carry(op.s.comments);
    const token = op.kind === 'insert' ? op.s : op.p;

    if (token.kind === 'start') {
      close();
      if (op.kind === 'same' && op.s.kind === 'start') {
        const p = op.p as typeof token;
        const s = op.s.paragraph;
        const base = plainParagraph(s);
        const before = {
          style: p.paragraph.style,
          props: p.paragraph.props,
          list: p.paragraph.list,
        };
        const changed =
          stableKey(before) !== stableKey({ style: s.style, props: s.props, list: s.list });
        const formatted: Paragraph = changed
          ? {
              ...base,
              suggested: {
                format: {
                  ...ctx.mark(),
                  before: {
                    style: before.style,
                    props: before.props,
                    ...(before.list ? { list: before.list } : {}),
                  },
                },
              },
            }
          : base;
        open = { paragraph: formatted, inlines: [], last: null };
      } else {
        const kind = op.kind === 'insert' ? 'break' : 'join';
        open = {
          paragraph: { ...plainParagraph(token.paragraph), suggested: { [kind]: stretchMark() } },
          inlines: [],
          last: null,
        };
      }
      continue;
    }

    if (token.kind === 'block') {
      close();
      if (op.kind === 'same') {
        const p = token.block;
        const s = (op.s as typeof token).block;
        out.push(...(p.type === 'table' && s.type === 'table' ? ctx.tables(p, s) : [p]));
      } else if (token.block.type === 'kept') {
        if (op.kind === 'delete') out.push(token.block);
        else ctx.leaveOut();
      } else {
        const kind = op.kind === 'insert' ? 'insertion' : 'deletion';
        out.push({ ...token.block, suggested: { [kind]: stretchMark() } } as Block);
      }
      continue;
    }

    if (op.kind === 'same' && token.kind === 'text' && op.s.kind === 'text') {
      const p = token.run;
      const s = op.s.run;
      if (sameFormatting(p, s)) {
        format = null;
        word(s, op.s.text, 'same');
      } else {
        format ??= ctx.mark();
        const before = { ...(p.style !== undefined ? { style: p.style } : {}), props: p.props };
        word(s, op.s.text, `format ${format.id}`, { format: { ...format, before } });
      }
      continue;
    }
    if (op.kind === 'same') {
      push((op.s as typeof token & { kind: 'object' }).inline);
      continue;
    }
    const kind = op.kind === 'insert' ? 'insertion' : 'deletion';
    const mark = stretchMark();
    if (token.kind === 'text') word(token.run, token.text, `${kind} ${mark.id}`, { [kind]: mark });
    else if (token.kind === 'object')
      push({ ...token.inline, suggested: { [kind]: mark } } as Inline);
  }
  carry(trailing);
  close();
  return out;
}
