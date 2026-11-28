// A spreadsheet's comment threads (docs/specs/029-sheets/review.md "Comments"): each sheet's threads by id, beside the
// cells in the sheet store, each anchored to a range by row and column ids so it follows its cells through inserted,
// moved and sorted lines. One op a write, judged here for who may make it: pure, so the api applies it and the tests
// read it without a room.
import type { CommentMention } from './comment-mentions';
import { drawnMentions } from './office-collab-rows';
import type { OfficeComment } from './office-comment';

/** The longest comment, as LiveDoc's comments (api-schema's COMMENT_TEXT_MAX, which this package cannot import). */
export const SHEET_COMMENT_TEXT_MAX = 2000;
/** The most threads one sheet holds (review.md "Limits"). */
export const SHEET_THREADS_MAX = 1000;
/** The most comments one thread holds. */
export const SHEET_THREAD_COMMENTS_MAX = 500;
/** The most different emoji one comment holds as reactions, as a text document's. */
export const SHEET_REACTIONS_MAX = 20;
/** The longest emoji a reaction holds, in UTF-16 code units. */
export const SHEET_REACTION_EMOJI_MAX = 16;

/** A thread's anchor: a range by row and column ids, one cell when they meet. */
export type SheetThreadAnchor = { r1: string; c1: string; r2: string; c2: string };

export type SheetThread = {
  readonly id: string;
  readonly sheetId: string;
  readonly anchor: SheetThreadAnchor;
  readonly resolved: boolean;
  /** Its first comment first. */
  readonly comments: readonly OfficeComment[];
  /** The thread's count of changes: a session keeps the highest it has seen. */
  readonly v: number;
};

type Said = { text: string; mentions?: CommentMention[]; assignee?: CommentMention };

export type SheetThreadOp =
  | ({ op: 'start'; id: string; comment: string; anchor: SheetThreadAnchor } & Said)
  | ({ op: 'reply'; thread: string; id: string } & Said)
  | ({ op: 'edit'; thread: string; comment: string } & Said)
  | { op: 'remove'; thread: string; comment: string }
  | { op: 'resolve'; thread: string; resolved: boolean }
  | { op: 'react'; thread: string; comment: string; emoji: string; on: boolean };

export type SheetThreadRefusal =
  'thread_invalid' | 'thread_gone' | 'threads_full' | 'thread_full' | 'forbidden';

/** Who makes an op: their adder key on the document, name and colour; `edits` an Editor's. */
export type SheetThreadWriter = {
  key: string;
  name: string;
  colour: string;
  edits: boolean;
  now: number;
};

/** The rows and columns of a sheet, by id in order: what an anchor is placed on. */
export type SheetAxes = { readonly rows: readonly string[]; readonly cols: readonly string[] };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
// Line breaks are a comment's own; every other control character is refused.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;

const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const isText = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.trim() !== '' &&
  v.length <= SHEET_COMMENT_TEXT_MAX &&
  !CONTROL.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readSaid(b: Record<string, unknown>): Said | null {
  if (!isText(b.text)) return null;
  if (b.mentions !== undefined && !Array.isArray(b.mentions)) return null;
  const mentions = drawnMentions(b.mentions as unknown[] | undefined);
  const [assignee] = b.assignee === undefined ? [] : drawnMentions([b.assignee]);
  if (b.assignee !== undefined && !assignee) return null;
  return {
    text: b.text,
    ...(mentions.length ? { mentions } : {}),
    ...(assignee ? { assignee } : {}),
  };
}

function readAnchor(v: unknown): SheetThreadAnchor | null {
  if (!isRecord(v)) return null;
  const { r1, c1, r2, c2 } = v;
  return isId(r1) && isId(c1) && isId(r2) && isId(c2) ? { r1, c1, r2, c2 } : null;
}

/** An op as sent, checked for its shape; null when malformed. */
export function readThreadOp(raw: unknown): SheetThreadOp | null {
  if (!isRecord(raw)) return null;
  const b = raw;
  switch (b.op) {
    case 'start': {
      const said = readSaid(b);
      const anchor = readAnchor(b.anchor);
      return said && anchor && isId(b.id) && isId(b.comment)
        ? { op: 'start', id: b.id, comment: b.comment, anchor, ...said }
        : null;
    }
    case 'reply': {
      const said = readSaid(b);
      return said && isId(b.thread) && isId(b.id)
        ? { op: 'reply', thread: b.thread, id: b.id, ...said }
        : null;
    }
    case 'edit': {
      const said = readSaid(b);
      return said && isId(b.thread) && isId(b.comment)
        ? { op: 'edit', thread: b.thread, comment: b.comment, ...said }
        : null;
    }
    case 'remove':
      return isId(b.thread) && isId(b.comment)
        ? { op: 'remove', thread: b.thread, comment: b.comment }
        : null;
    case 'resolve':
      return isId(b.thread) && typeof b.resolved === 'boolean'
        ? { op: 'resolve', thread: b.thread, resolved: b.resolved }
        : null;
    case 'react':
      return isId(b.thread) &&
        isId(b.comment) &&
        typeof b.emoji === 'string' &&
        b.emoji.length > 0 &&
        b.emoji.length <= SHEET_REACTION_EMOJI_MAX &&
        !CONTROL.test(b.emoji) &&
        typeof b.on === 'boolean'
        ? { op: 'react', thread: b.thread, comment: b.comment, emoji: b.emoji, on: b.on }
        : null;
    default:
      return null;
  }
}

/** The thread an op names, or the new thread's id. */
export const threadIdOf = (op: SheetThreadOp): string => (op.op === 'start' ? op.id : op.thread);

function commentOf(id: string, said: Said, who: SheetThreadWriter): OfficeComment {
  return {
    id,
    text: said.text,
    at: who.now,
    author: { key: who.key, name: who.name, colour: who.colour },
    ...(said.mentions ? { mentions: said.mentions } : {}),
    ...(said.assignee ? { assignee: said.assignee } : {}),
  };
}

function withReaction(
  c: OfficeComment,
  emoji: string,
  key: string,
  on: boolean,
): OfficeComment | null {
  const now = c.reactions?.[emoji] ?? [];
  const has = now.includes(key);
  if (has === on) return c;
  const keys = on ? [...now, key].sort() : now.filter((k) => k !== key);
  const reactions: Record<string, readonly string[]> = { ...c.reactions };
  if (keys.length) reactions[emoji] = keys;
  else delete reactions[emoji];
  if (Object.keys(reactions).length > SHEET_REACTIONS_MAX) return null;
  const { reactions: _, ...rest } = c;
  return Object.keys(reactions).length ? { ...rest, reactions } : rest;
}

export type ThreadOpResult =
  { ok: true; id: string; thread: SheetThread | null } | { ok: false; refusal: SheetThreadRefusal };

const refuse = (refusal: SheetThreadRefusal): ThreadOpResult => ({ ok: false, refusal });

/**
 * One op applied: `thread` the thread it names as stored (absent for a start), `count` the sheet's threads, `axes`
 * the sheet's rows and columns (a new anchor must be on them). Answers the thread after it, null once removed.
 */
export function applyThreadOp(
  at: { sheetId: string; thread: SheetThread | null; count: number; axes: SheetAxes },
  op: SheetThreadOp,
  who: SheetThreadWriter,
): ThreadOpResult {
  const { thread } = at;
  if (op.op === 'start') {
    if (thread) return refuse('thread_invalid');
    const { anchor } = op;
    const placed =
      [anchor.r1, anchor.r2].every((r) => at.axes.rows.includes(r)) &&
      [anchor.c1, anchor.c2].every((c) => at.axes.cols.includes(c));
    if (!placed) return refuse('thread_invalid');
    if (at.count >= SHEET_THREADS_MAX) return refuse('threads_full');
    return {
      ok: true,
      id: op.id,
      thread: {
        id: op.id,
        sheetId: at.sheetId,
        anchor: orderedAnchor(anchor, at.axes),
        resolved: false,
        comments: [commentOf(op.comment, op, who)],
        v: 1,
      },
    };
  }
  if (!thread) return refuse('thread_gone');
  const next = (patch: Partial<SheetThread>): ThreadOpResult => ({
    ok: true,
    id: thread.id,
    thread: { ...thread, ...patch, v: thread.v + 1 },
  });
  if (op.op === 'resolve') return next({ resolved: op.resolved });
  if (op.op === 'reply') {
    if (thread.comments.some((c) => c.id === op.id)) return refuse('thread_invalid');
    if (thread.comments.length >= SHEET_THREAD_COMMENTS_MAX) return refuse('thread_full');
    return next({ comments: [...thread.comments, commentOf(op.id, op, who)] });
  }
  const index = thread.comments.findIndex((c) => c.id === op.comment);
  if (index < 0) return refuse('thread_gone');
  const comment = thread.comments[index]!;
  const own = comment.author.key === who.key;
  const replaced = (c: OfficeComment) =>
    next({ comments: thread.comments.map((x, i) => (i === index ? c : x)) });
  if (op.op === 'edit') {
    if (!own) return refuse('forbidden');
    const { mentions: _m, assignee: _a, ...rest } = comment;
    return replaced({
      ...rest,
      text: op.text,
      edited: who.now,
      ...(op.mentions ? { mentions: op.mentions } : {}),
      ...(op.assignee ? { assignee: op.assignee } : {}),
    });
  }
  if (op.op === 'remove') {
    if (!own && !who.edits) return refuse('forbidden');
    if (index === 0) return { ok: true, id: thread.id, thread: null };
    return next({ comments: thread.comments.filter((_, i) => i !== index) });
  }
  const reacted = withReaction(comment, op.emoji, who.key, op.on);
  return reacted ? replaced(reacted) : refuse('thread_invalid');
}

// An anchor with its first row and column above and left of its last, as the sheet orders them now.
function orderedAnchor(a: SheetThreadAnchor, axes: SheetAxes): SheetThreadAnchor {
  const [r1, r2] = axes.rows.indexOf(a.r1) <= axes.rows.indexOf(a.r2) ? [a.r1, a.r2] : [a.r2, a.r1];
  const [c1, c2] = axes.cols.indexOf(a.c1) <= axes.cols.indexOf(a.c2) ? [a.c1, a.c2] : [a.c2, a.c1];
  return { r1, c1, r2, c2 };
}

/**
 * A sheet's open threads counted by their anchor's top-left cell, keyed as `@livedoc/sheets`' `cellKey` (`row:col`):
 * what an agent's read and the cells view give each anchored cell (029-sheets review.md "Agents").
 */
export function openThreadCounts(
  threads: readonly SheetThread[],
  sheetId: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of threads) {
    if (t.sheetId !== sheetId || t.resolved) continue;
    const key = `${t.anchor.r1}:${t.anchor.c1}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
