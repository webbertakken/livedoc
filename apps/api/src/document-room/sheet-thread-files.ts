// A spreadsheet's comment threads to and from its files (docs/specs/029-sheets/standard-mapping.md "Comments in the
// file"): a download writes each sheet's threads, authors by their names as written; an opened file's threads are
// stored with the new spreadsheet, each comment "From the file" (no key), bounded as any thread is.
import {
  drawnMentions,
  SHEET_COMMENT_TEXT_MAX,
  SHEET_REACTION_EMOJI_MAX,
  SHEET_REACTIONS_MAX,
  SHEET_THREAD_COMMENTS_MAX,
  SHEET_THREADS_MAX,
  type OfficeComment,
  type SheetThread,
} from '@livedoc/document';
import type { SheetLayout } from '@livedoc/sheets';
import type { FileComment, IdThread } from '@livedoc/sheets/files';

/** What a file's author is drawn in: no person behind them. */
const FROM_FILE_COLOUR = '#6b7280';
// Line breaks are a comment's own; every other control character is dropped.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

/** The workbook's threads by sheet, as a file writes them: authors by name, their colours, edits and reactions. */
export function fileThreadsBySheet(threads: readonly SheetThread[]): Map<string, IdThread[]> {
  const out = new Map<string, IdThread[]>();
  for (const t of threads) {
    const list = out.get(t.sheetId) ?? [];
    list.push({
      anchor: t.anchor,
      resolved: t.resolved,
      comments: t.comments.map((c): FileComment => ({
        text: c.text,
        at: c.at,
        author: c.author.name,
        colour: c.author.colour,
        ...(c.edited !== undefined ? { edited: c.edited } : {}),
        ...(c.mentions?.length ? { mentions: [...c.mentions] } : {}),
        ...(c.assignee !== undefined ? { assignee: c.assignee } : {}),
        ...(c.reactions ? { reactions: { ...c.reactions } as Record<string, string[]> } : {}),
      })),
    });
    out.set(t.sheetId, list);
  }
  return out;
}

// A file's reactions, within a thread's bounds: emoji and keys as text, at most SHEET_REACTIONS_MAX of them.
function reactionsOf(raw: FileComment['reactions']): OfficeComment['reactions'] {
  const kept = Object.entries(raw ?? {})
    .filter(
      ([emoji, keys]) =>
        emoji.length > 0 && emoji.length <= SHEET_REACTION_EMOJI_MAX && keys.length > 0,
    )
    .slice(0, SHEET_REACTIONS_MAX)
    .map(([emoji, keys]) => [emoji, [...new Set(keys)].sort()] as const);
  return kept.length ? Object.fromEntries(kept) : undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// A file's comment as the request carries it, its fields' kinds checked: the body is the caller's.
function readFileComment(v: unknown): FileComment | null {
  if (!isRecord(v) || typeof v.text !== 'string' || typeof v.author !== 'string') return null;
  if (typeof v.at !== 'number') return null;
  const reactions = isRecord(v.reactions)
    ? Object.fromEntries(
        Object.entries(v.reactions).filter(
          (e): e is [string, string[]] =>
            Array.isArray(e[1]) && e[1].every((k) => typeof k === 'string'),
        ),
      )
    : undefined;
  return {
    text: v.text,
    at: v.at,
    author: v.author,
    ...(typeof v.colour === 'string' ? { colour: v.colour } : {}),
    ...(typeof v.edited === 'number' ? { edited: v.edited } : {}),
    ...(Array.isArray(v.mentions) ? { mentions: v.mentions } : {}),
    ...(v.assignee !== undefined ? { assignee: v.assignee } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

function commentFromFile(c: FileComment, id: string): OfficeComment | null {
  const text = c.text.replace(CONTROL, '').slice(0, SHEET_COMMENT_TEXT_MAX);
  if (text.trim() === '' || !Number.isFinite(c.at)) return null;
  const mentions = drawnMentions(c.mentions);
  const [assignee] = c.assignee === undefined ? [] : drawnMentions([c.assignee]);
  const reactions = reactionsOf(c.reactions);
  return {
    id,
    text,
    at: c.at,
    ...(c.edited !== undefined && Number.isFinite(c.edited) ? { edited: c.edited } : {}),
    author: {
      name: c.author.slice(0, 200),
      colour: /^#[0-9a-f]{6}$/i.test(c.colour ?? '') ? c.colour! : FROM_FILE_COLOUR,
      fromFile: true,
    },
    ...(mentions.length ? { mentions } : {}),
    ...(assignee ? { assignee } : {}),
    ...(reactions ? { reactions } : {}),
  };
}

/**
 * An opened file's threads on a new sheet: each anchored to ids on its layout, its comments "From the file", within a
 * thread's bounds; one off the sheet or with no comment left is left out, and the sheet's past SHEET_THREADS_MAX.
 */
export function threadsFromFile(
  sheetId: string,
  layout: Pick<SheetLayout, 'rows' | 'cols'>,
  threads: readonly unknown[],
  newId: () => string,
): SheetThread[] {
  const rows = new Set(layout.rows);
  const cols = new Set(layout.cols);
  const out: SheetThread[] = [];
  for (const t of threads) {
    if (out.length >= SHEET_THREADS_MAX) break;
    if (!isRecord(t) || !isRecord(t.anchor) || !Array.isArray(t.comments)) continue;
    const { r1, c1, r2, c2 } = t.anchor;
    if (typeof r1 !== 'string' || typeof r2 !== 'string' || !rows.has(r1) || !rows.has(r2))
      continue;
    if (typeof c1 !== 'string' || typeof c2 !== 'string' || !cols.has(c1) || !cols.has(c2))
      continue;
    const comments = t.comments
      .slice(0, SHEET_THREAD_COMMENTS_MAX)
      .map(readFileComment)
      .map((c) => (c ? commentFromFile(c, newId()) : null))
      .filter((c): c is OfficeComment => c !== null);
    if (comments.length === 0) continue;
    out.push({
      id: newId(),
      sheetId,
      anchor: { r1, c1, r2, c2 },
      resolved: t.resolved === true,
      comments,
      v: 1,
    });
  }
  return out;
}
