'use client';

// A spreadsheet's comment threads in the grid (docs/specs/029-sheets/review.md "In the grid", "Mentions, assignees and
// the Inbox", D644, D653, D655, D656): the open sheet's threads read from the threads store, their markers and hover
// card through the grid's marks, the card of the active cell's open thread beside its anchor, and Insert › Comment
// (the toolbar's, the cell menu's, Ctrl+Alt+M) opening a new thread's card on the selection or the active cell's
// thread. Each write goes to the sheet's threads route, never into the cells or the undo history; a refusal is toasted.
import {
  drawnMentions,
  mentionsInText,
  sanitizeMentions,
  SHEET_THREADS_MAX,
  type CommentMention,
  type SheetThread,
  type SheetThreadAnchor,
  type SheetThreadOp,
} from '@livedoc/document';
import { cellKey, formatRange, threadAnchorAt, type GridRange } from '@livedoc/sheets';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { OfficeDraftCard, OfficeThreadCard } from '@/components/office/review/OfficeThreadCard';
import { readWorkbook } from '@/components/sheets/read-workbook';
import type { SheetController } from '@/components/sheets/sheet-controller';
import { mergeAt } from '@/components/sheets/sheet-geometry';
import type { SheetThreadMarks } from '@/components/sheets/sheet-thread-marks-context';
import { sheetThreadsFor } from '@/components/sheets/sheet-threads-store';
import type { SheetsScope } from '@/lib/api/sheets';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { reactorNames } from '@/lib/office/review/comment-reactions';
import { sharedComment } from '@/lib/office/review/office-comments';
import {
  anchorOfRange,
  INSERT_COMMENT,
  openThreadsByCell,
  steppedThread,
  SYNC_TO_COMMENT,
  SYNC_TO_COMMENT_NOTE,
  threadRefusalWords,
  threadsInReadingOrder,
} from '@/lib/spreadsheet/sheet-comments';
import { track } from '@/lib/telemetry';
import { cellScreenBox } from './active-cell-box';
import { SheetThreadPopup } from './SheetThreadPopup';
import { useSpreadsheetReview } from './spreadsheet-review-context';

const NO_THREADS: ReadonlyMap<string, SheetThread> = new Map();

/** What the sheets say when the sheet holds the most threads it can (review.md "Limits"). */
export const SHEET_COMMENTS_FULL = 'This sheet holds the most comments it can';

type Draft = { sheetId: string; cell: string; range: GridRange; anchor: SheetThreadAnchor };
// A request to move the keys into the card: its reply field, or the card itself (J and K).
type Focus = { nonce: number; to: 'reply' | 'card' };

const newId = () => crypto.randomUUID();

export function useSpreadsheetComments(
  c: SheetController,
  { scope, goTo }: { scope: SheetsScope; goTo: (range: GridRange) => void },
): {
  actions: OfficeActions;
  card: ReactNode;
  marks: SheetThreadMarks | null;
  /** Moves to the next or previous thread in reading order, the keys into its card when asked. */
  step: (forward: boolean, to: 'reply' | 'card' | null) => void;
} {
  const review = useSpreadsheetReview();
  const { commenter, local, selfUserId, onMentioned, onAssigned } = review;
  const store = sheetThreadsFor(c.store, scope);
  const all = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Read once a commenter is here: a Viewer reads none (D655), This Browser has none (D656).
  useEffect(() => {
    if (commenter) store.ensureLoaded();
  }, [commenter, store]);
  const sheetId = c.sheet.id;
  const byCell = useMemo(
    () => (commenter ? openThreadsByCell(all.values(), sheetId) : NO_THREADS),
    [commenter, all, sheetId],
  );

  // The active cell, a merged area's top-left, and its key by ids.
  const { r, c: col } = c.selection.active;
  const merge = mergeAt(c.geometry, r, col);
  const at = merge ? { r: merge.r1, c: merge.c1 } : { r, c: col };
  const activeKey = readWorkbook(c.version, () => {
    const rowId = c.sheet.layout.rows[at.r];
    const colId = c.sheet.layout.cols[at.c];
    return rowId !== undefined && colId !== undefined ? cellKey(rowId, colId) : null;
  });
  const here = activeKey === null ? null : (byCell.get(activeKey) ?? null);

  const [draft, setDraft] = useState<Draft | null>(null);
  // The cell whose thread card was let go (Escape, U), until the active cell moves.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  // A draft lasts while its cell stays active on its sheet; a dismissal while its cell does.
  const draftHere = draft && draft.sheetId === sheetId && draft.cell === activeKey ? draft : null;
  if (draft && !draftHere) setDraft(null);
  if (dismissed !== null && dismissed !== activeKey) setDismissed(null);
  const shown = !draftHere && here && dismissed !== activeKey && !c.editing ? here : null;

  const { toast, focusGrid } = c;
  const sent = useCallback(
    async (thread: string | null, threadSheet: string, op: SheetThreadOp): Promise<boolean> => {
      const res = await store.send(threadSheet, op);
      if (!res.ok) toast(threadRefusalWords(res.code));
      debugLog(
        `[sheets] thread ${op.op} ${res.ok ? 'saved' : 'refused'} thread=${thread ?? 'new'}`,
      );
      return res.ok;
    },
    [store, toast],
  );

  // Once a comment with mentions is added: counted, and those it names emailed; once one assigns the thread, the
  // action counted and its assignee emailed (034 review.md "Mentions", "Assigning").
  const mentioned = useCallback(
    (text: string, mentions: readonly CommentMention[], assignee?: CommentMention) => {
      if (mentions.length) onMentioned?.(text, mentions);
      if (!assignee) return;
      track('Action', 'Created', 'SpreadsheetComment');
      onAssigned?.(text, assignee);
    },
    [onMentioned, onAssigned],
  );

  const openHere = useCallback(() => {
    if (!commenter || activeKey === null) return;
    if (here) {
      setDismissed(null);
      setFocus((f) => ({ nonce: (f?.nonce ?? 0) + 1, to: 'reply' }));
      debugLog(`[sheets] thread card opened thread=${here.id}`);
      return;
    }
    const range = c.selection.ranges.at(-1) ?? { r1: at.r, c1: at.c, r2: at.r, c2: at.c };
    const anchor = readWorkbook(c.version, () =>
      anchorOfRange(c.sheet.layout, range, (rr, cc) => mergeAt(c.geometry, rr, cc)),
    );
    if (!anchor) return;
    if (store.list(sheetId).length >= SHEET_THREADS_MAX) {
      debugLog(`[sheets] thread refused threads_full sheet=${sheetId}`);
      return toast(SHEET_COMMENTS_FULL);
    }
    setDraft({ sheetId, cell: activeKey, range, anchor });
    debugLog(`[sheets] thread draft opened sheet=${sheetId}`);
  }, [commenter, activeKey, here, c, at.r, at.c, store, sheetId, toast]);

  const send = useCallback(
    (text: string, mentions: CommentMention[], assignee?: CommentMention) => {
      if (!draftHere || !commenter) return;
      const op: SheetThreadOp = {
        op: 'start',
        id: newId(),
        comment: newId(),
        anchor: draftHere.anchor,
        text,
        ...(mentions.length ? { mentions } : {}),
        ...(assignee ? { assignee } : {}),
      };
      setDraft(null);
      void sent(null, draftHere.sheetId, op).then((ok) => {
        if (!ok) return;
        track('Comment', 'Added', 'Spreadsheet');
        mentioned(text, mentions, assignee);
      });
    },
    [draftHere, commenter, sent, mentioned],
  );

  const exit = useCallback(() => {
    if (draftHere) setDraft(null);
    else if (activeKey !== null) setDismissed(activeKey);
    focusGrid();
  }, [draftHere, activeKey, focusGrid]);

  // J and K on a card, Ctrl+Alt+N, C and Ctrl+Alt+P, C: the next or previous thread of the sheet in reading order.
  const step = useCallback(
    (forward: boolean, to: Focus['to'] | null) => {
      const ordered = readWorkbook(c.version, () => threadsInReadingOrder(c.sheet.layout, byCell));
      const next = steppedThread(ordered, { r: at.r, c: at.c }, forward);
      if (!next) return;
      goTo(next.range);
      if (to) setFocus((f) => ({ nonce: (f?.nonce ?? 0) + 1, to }));
      debugLog(`[sheets] thread stepped forward=${forward} thread=${next.thread.id}`);
    },
    [c, byCell, at.r, at.c, goTo],
  );

  // Who reacted, by key: each author's latest name in this spreadsheet.
  const names = useMemo(
    () => reactorNames([...all.values()].flatMap((t) => t.comments.map(sharedComment))),
    [all],
  );

  const reply = useRef<HTMLTextAreaElement>(null);
  const cardEl = useRef<HTMLDivElement>(null);
  // The keys move into the card once it is drawn and placed, a frame on.
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => {
      if (focus.to === 'reply') reply.current?.focus();
      else cardEl.current?.querySelector<HTMLElement>('[data-thread-card]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const actions = useMemo((): OfficeActions => {
    if (local)
      return {
        [INSERT_COMMENT]: {
          run: () => {},
          disabled: true,
          note: SYNC_TO_COMMENT_NOTE,
          hint: SYNC_TO_COMMENT,
        },
      };
    if (!commenter) return {};
    return { [INSERT_COMMENT]: { run: openHere } };
  }, [local, commenter, openHere]);

  const marks = useMemo(
    (): SheetThreadMarks | null =>
      commenter ? { byCell, openCell: shown || draftHere ? activeKey : null } : null,
    [commenter, byCell, shown, draftHere, activeKey],
  );

  // The card sits to the right of its anchor: a thread's range now, a draft's selection.
  const range = shown
    ? readWorkbook(c.version, () => threadAnchorAt(c.sheet.layout, shown.anchor))
    : (draftHere?.range ?? null);
  let card: ReactNode = null;
  if (commenter && range && !('deleted' in range)) {
    const top = cellScreenBox(c, range.r1, range.c1).top;
    const right = cellScreenBox(c, range.r1, range.c2).right;
    card = (
      <SheetThreadPopup at={{ top, right }} onExit={exit}>
        <div ref={cardEl}>
          {shown ? (
            <OfficeThreadCard
              key={shown.id}
              thread={shown}
              label={`Comment by ${shown.comments[0]?.author.name || 'someone'} on ${formatRange(range)}`}
              selected
              commenter={commenter}
              replyFieldRef={reply}
              selfUserId={selfUserId}
              names={names}
              onSelect={() => {}}
              onStep={(forward) => step(forward, 'card')}
              onExit={exit}
              onReply={(text, mentions, assignee) =>
                void sent(shown.id, shown.sheetId, {
                  op: 'reply',
                  thread: shown.id,
                  id: newId(),
                  text,
                  ...(mentions.length ? { mentions } : {}),
                  ...(assignee ? { assignee } : {}),
                }).then((ok) => {
                  if (!ok) return;
                  track('Comment', 'Added', 'Spreadsheet');
                  mentioned(text, mentions, assignee);
                })
              }
              onEdit={(commentId, text) => {
                // An edit keeps the mentions whose handle is still in its text, and the thread's assignee.
                const held = shown.comments.find((x) => x.id === commentId);
                const kept = held?.mentions
                  ? mentionsInText(text, sanitizeMentions(held.mentions) ?? [])
                  : [];
                const [assignee] =
                  held?.assignee === undefined ? [] : drawnMentions([held.assignee]);
                void sent(shown.id, shown.sheetId, {
                  op: 'edit',
                  thread: shown.id,
                  comment: commentId,
                  text,
                  ...(kept.length ? { mentions: kept } : {}),
                  ...(assignee ? { assignee } : {}),
                });
              }}
              onRemove={(commentId) =>
                void sent(shown.id, shown.sheetId, {
                  op: 'remove',
                  thread: shown.id,
                  comment: commentId,
                })
              }
              onResolve={(resolved) =>
                void sent(shown.id, shown.sheetId, {
                  op: 'resolve',
                  thread: shown.id,
                  resolved,
                }).then((ok) => {
                  if (ok && resolved) track('Comment', 'Resolved', 'Spreadsheet');
                  if (ok && resolved) focusGrid();
                })
              }
              onReact={(commentId, emoji, on) =>
                void sent(shown.id, shown.sheetId, {
                  op: 'react',
                  thread: shown.id,
                  comment: commentId,
                  emoji,
                  on,
                }).then((ok) => {
                  if (ok && on) track('Comment', 'Added', 'SpreadsheetReaction');
                })
              }
            />
          ) : (
            <OfficeDraftCard commenter={commenter} placed onSend={send} onCancel={exit} />
          )}
        </div>
      </SheetThreadPopup>
    );
  }
  return { actions, card, marks, step };
}
