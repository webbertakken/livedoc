// Comment threads in the model (docs/specs/034-text-documents/review.md "How a comment is kept"): a thread's stretch
// is marked in its document tab's writing by a start and an end marker, which show nothing; its comments sit beside
// the writing in `TextDocument.comments`. A point comment is a start with its end right after it.
import type { Block, Inline, Paragraph } from './blocks';
import type { KeptProperties, TextProps } from './props';
import type { TextDocument } from './text-document';
import { DocumentTabs } from './document-tabs';
import type { ReportBuilder } from '../report';
import { MENTION_FIELD_MAX, MENTIONS_MAX } from '@livedoc/document';

/** One edge of a thread's stretch in the writing. */
export type CommentMark = {
  readonly type: 'comment';
  readonly edge: 'start' | 'end';
  /** The thread's id. */
  readonly id: string;
  /** The formatting of the run it sat in (ODF writes it inside its span). */
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
};

/** Who wrote a comment: a name for a file; a LiveDoc person's adder key and colour besides. */
export type CommentAuthor = {
  readonly name: string;
  readonly initials?: string;
  readonly key?: string;
  readonly colour?: string;
};

export type FileComment = {
  readonly id: string;
  /** Plain text, its paragraphs joined by line breaks. */
  readonly text: string;
  /** When it was made (ms), where it says. */
  readonly at?: number;
  readonly author: CommentAuthor;
  /** Each emoji's reactors by key, sorted (review.md "Reactions"); kept in `livedoc:reactions`. */
  readonly reactions?: Readonly<Record<string, readonly string[]>>;
  /** Whom it mentions, by name and handle alone (review.md "Mentions"); kept in `livedoc:mentions`. */
  readonly mentions?: readonly FileMention[];
};

/** A mention as a file keeps it: never an account or member id, which say who someone is beyond the document. */
export type FileMention = { readonly name: string; readonly handle: string };

/** (default) The most different emoji one comment holds as reactions (review.md "Reactions"). */
export const TEXT_DOCUMENT_REACTIONS_MAX = 20;
/** The longest emoji a reaction holds, in UTF-16 code units: a family or flag sequence fits. */
export const REACTION_EMOJI_MAX = 16;
// A reactor key: the room's adder key, hex (share-roles.md SR4).
const REACTOR_KEY = /^[0-9a-f]{1,64}$/;

export type FileThread = {
  readonly id: string;
  readonly resolved: boolean;
  /** The stretch as it read when the thread began, where the live state held one; else the stretch's own text. */
  readonly quote?: string;
  /** Its first comment first. */
  readonly comments: readonly FileComment[];
};

type Mapped = (inline: Inline) => readonly Inline[];

/** The blocks with each paragraph's inlines mapped in reading order (table cells row by row; notes as `inNote`). */
function mapInlines(blocks: readonly Block[], map: Mapped, inNote: Mapped): Block[] {
  return blocks.map((block): Block => {
    if (block.type === 'paragraph')
      return {
        ...block,
        inlines: block.inlines.flatMap((inline) =>
          inline.type === 'note'
            ? [{ ...inline, blocks: mapInlines(inline.blocks, inNote, inNote) }]
            : map(inline),
        ),
      };
    if (block.type === 'table')
      return {
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => ({
            ...cell,
            blocks: mapInlines(cell.blocks, map, inNote),
          })),
        })),
      };
    return block;
  });
}

const holdsMarks = (blocks: readonly Block[]): boolean =>
  blocks.some((block) =>
    block.type === 'paragraph'
      ? block.inlines.some(
          (i) => i.type === 'comment' || (i.type === 'note' && holdsMarks(i.blocks)),
        )
      : block.type === 'table' &&
        block.rows.some((row) => row.cells.some((cell) => holdsMarks(cell.blocks))),
  );

const MARKER = 'comment marker';

/** The markers that stand, by thread: the tab its start is in, and whether an end follows it there. */
function pairs(
  document: TextDocument,
  threads: ReadonlySet<string>,
): Map<string, { tab: string; ended: boolean }> {
  const found = new Map<string, { tab: string; ended: boolean }>();
  for (const tab of DocumentTabs.all(document)) {
    const look: Mapped = (inline) => {
      if (inline.type !== 'comment' || !threads.has(inline.id)) return [];
      const held = found.get(inline.id);
      if (inline.edge === 'start' && !held) found.set(inline.id, { tab: tab.id, ended: false });
      if (inline.edge === 'end' && held?.tab === tab.id) held.ended = true;
      return [];
    };
    mapInlines(tab.body, look, () => []);
  }
  return found;
}

export const Comments = {
  /**
   * The document as review.md keeps comments: a thread stands where its start marker is (its first, in reading
   * order); a start with no end after it in its tab is a point, its end put right after it; an end without its start,
   * a second marker, a marker whose thread is absent, a marker in a note, and a thread with no start are dropped, each
   * counted in the report.
   */
  settle: (document: TextDocument, report: ReportBuilder): TextDocument => {
    const threads = document.comments ?? [];
    const bodies = DocumentTabs.all(document).map((t) => t.body);
    if (threads.length === 0 && !bodies.some(holdsMarks)) {
      const { comments: _, ...rest } = document;
      return rest;
    }
    const found = pairs(document, new Set(threads.map((t) => t.id)));
    const started = new Set<string>();
    const ended = new Set<string>();
    const inStory: Mapped = (inline) => {
      if (inline.type !== 'comment') return [inline];
      report.drop('comment-in-story', MARKER);
      return [];
    };
    const settled = DocumentTabs.mapBodies(document, (body) =>
      mapInlines(
        body,
        (inline) => {
          if (inline.type !== 'comment') return [inline];
          const pair = found.get(inline.id);
          if (inline.edge === 'start' && pair && !started.has(inline.id)) {
            started.add(inline.id);
            if (pair.ended) return [inline];
            ended.add(inline.id);
            return [inline, { ...inline, edge: 'end' }];
          }
          if (
            inline.edge === 'end' &&
            pair?.ended &&
            started.has(inline.id) &&
            !ended.has(inline.id)
          ) {
            ended.add(inline.id);
            return [inline];
          }
          report.drop('comment-unpaired', MARKER);
          return [];
        },
        inStory,
      ),
    );
    const kept = threads.filter((t) => found.has(t.id));
    if (kept.length < threads.length)
      report.drop('comment-unpaired', 'comment', threads.length - kept.length);
    const { comments: _, ...rest } = settled;
    return kept.length > 0 ? { ...rest, comments: kept } : rest;
  },

  /** Each thread's stretch as text, in reading order: paragraphs joined by line breaks; a point's is empty. */
  quotes: (blocks: readonly Block[]): Map<string, string> => {
    const open = new Map<string, string>();
    const quotes = new Map<string, string>();
    const paragraphs: Paragraph[] = [];
    const collect = (bs: readonly Block[]): void => {
      for (const b of bs)
        if (b.type === 'paragraph') paragraphs.push(b);
        else if (b.type === 'table')
          for (const row of b.rows) for (const cell of row.cells) collect(cell.blocks);
    };
    collect(blocks);
    paragraphs.forEach((paragraph, at) => {
      if (at > 0) for (const [id, text] of open) open.set(id, `${text}\n`);
      for (const inline of paragraph.inlines) {
        if (inline.type === 'comment') {
          if (inline.edge === 'start') open.set(inline.id, '');
          else if (open.has(inline.id)) {
            quotes.set(inline.id, open.get(inline.id)!);
            open.delete(inline.id);
          }
        } else if (inline.type === 'run')
          for (const [id, text] of open) open.set(id, text + inline.text);
      }
    });
    return quotes;
  },

  /** A name's initials, as Word shows a comment's author: the first letters of its first and last words. */
  initials: (name: string): string => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    const first = words[0]![0]!.toUpperCase();
    return words.length === 1 ? first : first + words.at(-1)![0]!.toUpperCase();
  },

  /** A file's comment date as ms: one with no zone is UTC, as both formats' writers mean it; none for no date. */
  timeOf: (date: string | undefined): number | undefined => {
    if (date === undefined) return undefined;
    const trimmed = date.trim();
    const at = Date.parse(/T[\d:.]+$/.test(trimmed) ? `${trimmed}Z` : trimmed);
    return Number.isFinite(at) ? at : undefined;
  },

  /** A comment's reactions as `livedoc:reactions` holds them: a JSON object of each emoji's reactor keys; none for none. */
  reactionsText: (reactions: FileComment['reactions']): string | undefined =>
    reactions && Object.keys(reactions).length > 0 ? JSON.stringify(reactions) : undefined,

  /**
   * `livedoc:reactions` read: an object of at most `TEXT_DOCUMENT_REACTIONS_MAX` emoji, each at most
   * `REACTION_EMOJI_MAX` long, holding reactor keys; an emoji with none is left out; anything else reads as none.
   */
  readReactions: (text: string | undefined): FileComment['reactions'] => {
    if (text === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > TEXT_DOCUMENT_REACTIONS_MAX) return undefined;
    const out: Record<string, string[]> = {};
    for (const [emoji, keys] of entries) {
      if (emoji === '' || emoji.length > REACTION_EMOJI_MAX || emoji.includes('\n'))
        return undefined;
      if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string' && REACTOR_KEY.test(k)))
        return undefined;
      if (keys.length > 0) out[emoji] = [...new Set(keys as string[])].sort();
    }
    return Object.keys(out).length > 0 ? out : undefined;
  },

  /** `livedoc:reactions` read as a comment's field: `{ reactions }`, or nothing where there are none. */
  reactionsFrom: (text: string | undefined): { reactions?: Record<string, readonly string[]> } => {
    const reactions = Comments.readReactions(text);
    return reactions ? { reactions } : {};
  },

  /** A comment's mentions as `livedoc:mentions` holds them: a JSON array of each one's name and handle; none for none. */
  mentionsText: (mentions: FileComment['mentions']): string | undefined =>
    mentions && mentions.length > 0
      ? JSON.stringify(mentions.map(({ name, handle }) => ({ name, handle })))
      : undefined,

  /**
   * `livedoc:mentions` read: the first `MENTIONS_MAX` entries whose name and handle are text of 1 to
   * `MENTION_FIELD_MAX` characters, each as just those two; anything else reads as none.
   */
  readMentions: (text: string | undefined): FileComment['mentions'] => {
    if (text === undefined) return undefined;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return undefined;
    }
    if (!Array.isArray(value)) return undefined;
    const field = (v: unknown): v is string =>
      typeof v === 'string' && v.length > 0 && v.length <= MENTION_FIELD_MAX;
    const out: FileMention[] = [];
    for (const entry of value as unknown[]) {
      if (out.length === MENTIONS_MAX) break;
      if (typeof entry !== 'object' || entry === null) continue;
      const { name, handle } = entry as Record<string, unknown>;
      if (field(name) && field(handle)) out.push({ name, handle });
    }
    return out.length > 0 ? out : undefined;
  },

  /** `livedoc:mentions` read as a comment's field: `{ mentions }`, or nothing where there are none. */
  mentionsFrom: (text: string | undefined): { mentions?: readonly FileMention[] } => {
    const mentions = Comments.readMentions(text);
    return mentions ? { mentions } : {};
  },

  /** A comment's plain text as its paragraphs, one at least. */
  lines: (text: string): string[] => text.split(/\r?\n/),
} as const;
