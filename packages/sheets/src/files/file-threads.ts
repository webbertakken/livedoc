// A sheet's comment threads in a file (docs/specs/029-sheets/standard-mapping.md "Comments in the file", D657-D660):
// each thread by its range's positions, its comments by author name, and LiveDoc's record of what a format cannot
// hold (the range, colours, edit times, mentions, assignees, reactions, a note on the same cell). This package cannot
// read @livedoc/document's thread, so the boundary (the api's download and import) turns ids into positions.
import { crc32 } from '@livedoc/office-packages';
import type { GridRange } from '../address';
import type { IdRange, SheetLayout } from '../sheet';
import { threadAnchorAt } from '../thread-anchor';

/** The most threads a sheet holds, and comments a thread, and characters a comment (@livedoc/document's limits). */
export const FILE_THREADS_MAX = 1000;
export const FILE_THREAD_COMMENTS_MAX = 500;
export const FILE_COMMENT_TEXT_MAX = 2000;

/** A comment as a file holds it: an author by name alone. */
export type FileComment = {
  text: string;
  /** When it was made (ms). */
  at: number;
  author: string;
  colour?: string;
  edited?: number;
  mentions?: unknown[];
  assignee?: unknown;
  reactions?: Record<string, string[]>;
};

/** A thread on a sheet, its range by zero-based positions, its first comment first. */
export type FileThread = GridRange & { resolved: boolean; comments: FileComment[] };

/** LiveDoc's record of a thread beside a format's own: what the format cannot hold. */
export type ThreadRecord = {
  range: GridRange;
  resolved: boolean;
  comments: FileComment[];
  /** The cell's note, where the format gives the cell's one comment to the thread (D658, D659). */
  note?: string;
};

/** A thread's record as JSON, its cell's note with it. */
export function threadRecordJson(thread: FileThread, note: string | undefined): string {
  const { r1, c1, r2, c2, resolved, comments } = thread;
  const record: ThreadRecord = {
    range: { r1, c1, r2, c2 },
    resolved,
    comments,
    ...(note !== undefined ? { note } : {}),
  };
  return JSON.stringify(record);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function readComment(v: unknown): FileComment | null {
  if (!isRecord(v) || typeof v.text !== 'string' || typeof v.author !== 'string') return null;
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
  const reactions = isRecord(v.reactions)
    ? Object.fromEntries(
        Object.entries(v.reactions).filter(
          (e): e is [string, string[]] =>
            Array.isArray(e[1]) && e[1].every((k) => typeof k === 'string'),
        ),
      )
    : undefined;
  return {
    text: v.text.slice(0, FILE_COMMENT_TEXT_MAX),
    at: v.at,
    author: v.author,
    ...(typeof v.colour === 'string' ? { colour: v.colour } : {}),
    ...(typeof v.edited === 'number' && Number.isFinite(v.edited) ? { edited: v.edited } : {}),
    ...(Array.isArray(v.mentions) ? { mentions: v.mentions } : {}),
    ...(v.assignee !== undefined ? { assignee: v.assignee } : {}),
    ...(reactions && Object.keys(reactions).length ? { reactions } : {}),
  };
}

/** A record read back, or null when it is not one LiveDoc wrote. */
export function readThreadRecord(json: string): ThreadRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw) || !isRecord(raw.range) || typeof raw.resolved !== 'boolean') return null;
  const { r1, c1, r2, c2 } = raw.range;
  if (!isCount(r1) || !isCount(c1) || !isCount(r2) || !isCount(c2) || r2 < r1 || c2 < c1)
    return null;
  if (!Array.isArray(raw.comments)) return null;
  const comments = raw.comments.map(readComment);
  if (comments.length === 0 || comments.some((c) => c === null)) return null;
  return {
    range: { r1, c1, r2, c2 },
    resolved: raw.resolved,
    comments: comments as FileComment[],
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
  };
}

/** A thread's conversation as text another suite shows: the first comment, then each reply after its author. */
export function threadLines(thread: { comments: readonly FileComment[] }): string[] {
  const [first, ...replies] = thread.comments;
  if (!first) return [];
  return [
    ...first.text.split('\n'),
    ...replies.flatMap((c) => `${c.author}: ${c.text}`.split('\n')),
  ];
}

/** The fingerprint an ODF annotation's text carries: whether another suite changed it since (D660). */
export function threadFingerprint(lines: readonly string[]): string {
  return crc32(new TextEncoder().encode(lines.join('\n')))
    .toString(16)
    .padStart(8, '0');
}

/** A sheet's threads within a format's reading limits: what is past them cut, counted. */
export function threadsWithinLimits(threads: readonly FileThread[]): {
  threads: FileThread[];
  cut: number;
} {
  let cut = Math.max(0, threads.length - FILE_THREADS_MAX);
  const kept = threads.slice(0, FILE_THREADS_MAX).map((t) => {
    const comments = t.comments.slice(0, FILE_THREAD_COMMENTS_MAX).map((c) => {
      if (c.text.length <= FILE_COMMENT_TEXT_MAX) return c;
      cut++;
      return { ...c, text: c.text.slice(0, FILE_COMMENT_TEXT_MAX) };
    });
    cut += t.comments.length - comments.length;
    return { ...t, comments };
  });
  return { threads: kept, cut };
}

/** A thread by its anchor's row and column ids, as the sheet store holds it: what a download writes, an import makes. */
export type IdThread = { anchor: IdRange; resolved: boolean; comments: FileComment[] };

/** A sheet's threads as a file places them, in reading order; one whose top-left cell is gone is left out (D653). */
export function fileThreadsOf(
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  threads: readonly IdThread[],
): FileThread[] {
  const placed: FileThread[] = [];
  for (const t of threads) {
    const at = threadAnchorAt(layout, t.anchor);
    if ('deleted' in at || t.comments.length === 0) continue;
    placed.push({ ...at, resolved: t.resolved, comments: t.comments });
  }
  return placed.sort((a, b) => a.r1 - b.r1 || a.c1 - b.c1);
}

/** A file's threads on a made sheet, by its rows' and columns' ids; one past the sheet is left out. */
export function idThreadsOf(
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  threads: readonly FileThread[] | undefined,
): IdThread[] {
  const out: IdThread[] = [];
  for (const t of threads ?? []) {
    const [r1, c1, r2, c2] = [
      layout.rows[t.r1],
      layout.cols[t.c1],
      layout.rows[t.r2],
      layout.cols[t.c2],
    ];
    if (r1 === undefined || c1 === undefined || r2 === undefined || c2 === undefined) continue;
    out.push({ anchor: { r1, c1, r2, c2 }, resolved: t.resolved, comments: t.comments });
  }
  return out;
}

/** The most bytes of threads one request to store an opened file's threads carries. */
export const THREAD_BATCH_BYTES = 256_000;

/** A sheet's threads in parts of at most `maxBytes` of JSON each, a thread larger than that a part of its own. */
export function threadBatches(
  threads: readonly IdThread[],
  maxBytes = THREAD_BATCH_BYTES,
): IdThread[][] {
  const batches: IdThread[][] = [];
  let batch: IdThread[] = [];
  let bytes = 0;
  for (const thread of threads) {
    const size = JSON.stringify(thread).length;
    if (batch.length > 0 && bytes + size > maxBytes) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(thread);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
