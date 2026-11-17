'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Select } from '@livedoc/ui';
import { TERM_MAX, type ElementId, type TermScope } from '@livedoc/document';
import { boardTerms, type BoardTerm, type StormReading } from '@livedoc/storm-reading';
import { useEscapeLayer } from '@/hooks/ui/useEscapeLayer';
import { REVIEW_MUTED, REVIEW_ROW, ReviewEmpty, RowAct } from './review-parts';

// The Language tab (docs/specs/021-event-storming/board-language.md "The Language tab"): the board's terms, most
// used first, each with how many notes hold it and the contexts it is used in. A filter narrows the list to one
// candidate context or to the notes in none. Choosing a term rings its notes and dims the rest; Rename Term opens
// it for typing, the board previewing the new term as it is typed, and renames it where the list is narrowed to.
// The keyboard never falls to the page when what held it is put away: leaving the field hands it to Rename Term,
// letting a term go to the term, and a rename to the row standing where the renamed term stood.
// The rings and the dimming are a highlight on the board: Escape pressed anywhere else, the board included, lets go
// of the rename first and then the term, and the keyboard stays where it was (docs/specs/004-interface-design/escape.md).

/** The Review panel, whose own keys take an Escape pressed in it. */
export const REVIEW_PANEL = '[data-review-panel]';

const ALL = 'all';
const NONE = 'none';
const ID_SEPARATOR = '\u0000';

export type TermRenameAsk = { from: string; to: string; scope: TermScope };

type Row = { term: BoardTerm; notes: ElementId[]; contexts: string[] };

// Where the keyboard goes next: a term's row (by its key, or by where it stands in the list), on the term's own
// button or on its Rename Term. `after`: not before the board has been read again past this reading.
type HandTo = { row: string | number; rename?: boolean; after?: StormReading };

const scopeOf = (filter: string): TermScope =>
  filter === ALL
    ? { type: 'board' }
    : filter === NONE
      ? { type: 'none' }
      : { type: 'context', id: filter };

const noteCount = (n: number) => `${n} note${n === 1 ? '' : 's'}`;

export function ReviewLanguage({
  reading,
  mayWrite,
  onRing,
  onPreview,
  wouldChange,
  onRename,
}: {
  reading: StormReading;
  // Whether Rename Term is offered: an Editor's alone.
  mayWrite: boolean;
  // Ring these notes, dimming the rest, and fit them in view; none lets go.
  onRing: (ids: readonly ElementId[], dim?: boolean) => void;
  // Draw the board as the rename would leave it; null puts it back.
  onPreview: (ask: TermRenameAsk | null) => void;
  // Whether the rename would change anything: a term renamed to itself or to nothing changes nothing.
  wouldChange: (ask: TermRenameAsk) => boolean;
  onRename: (ask: TermRenameAsk) => void;
}) {
  const filterId = useId();
  const fieldId = useId();
  const [filter, setFilter] = useState(ALL);
  // The chosen term, by what it is compared by: it stays chosen while the board changes round it.
  const [chosen, setChosen] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const handTo = useRef<HandTo | null>(null);
  useEffect(() => {
    const to = handTo.current;
    // A rename's rows change once the board is read again: a row focused before then would go with the old term.
    if (!to || to.after === reading) return;
    handTo.current = null;
    // Whoever took the keyboard meanwhile keeps it.
    const held = document.activeElement;
    if (held instanceof HTMLElement && held !== document.body && held.isConnected) return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[data-review-term]') ?? [])];
    const item =
      typeof to.row === 'number'
        ? items[Math.min(to.row, items.length - 1)]
        : items.find((i) => i.dataset.reviewTerm === to.row);
    item
      ?.querySelector<HTMLElement>(to.rename ? '[data-rename-term]' : 'button')
      ?.focus({ preventScroll: true });
  });

  const contexts = reading.contexts;
  const contextOf = new Map<ElementId, ElementId>();
  for (const c of contexts) for (const id of c.notes) contextOf.set(id, c.id);
  // A context that is gone takes its filter with it.
  const shown =
    filter === ALL || filter === NONE || contexts.some((c) => c.id === filter) ? filter : ALL;
  const inScope = (id: ElementId) =>
    shown === ALL || (shown === NONE ? !contextOf.has(id) : contextOf.get(id) === shown);
  const rows: Row[] = boardTerms(reading)
    .map((term) => ({
      term,
      notes: term.notes.filter(inScope),
      contexts: contexts.filter((c) => term.contexts.includes(c.id)).map((c) => c.name),
    }))
    .filter((row) => row.notes.length > 0)
    .sort((a, b) => b.notes.length - a.notes.length || a.term.key.localeCompare(b.term.key));
  const row = rows.find((r) => r.term.key === chosen) ?? null;
  const renaming = row !== null && draft !== null;
  const scope = scopeOf(shown);
  const ask = row && draft !== null ? { from: row.term.term, to: draft.trim(), scope } : null;

  const ringed = row ? row.notes.join(ID_SEPARATOR) : '';
  useEffect(() => {
    onRing(ringed ? ringed.split(ID_SEPARATOR) : [], true);
  }, [ringed, onRing]);
  // The preview follows what is typed, and goes with the field.
  const previewed = ask ? JSON.stringify(ask) : '';
  useEffect(() => {
    onPreview(previewed ? (JSON.parse(previewed) as TermRenameAsk) : null);
  }, [previewed, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);
  useEffect(() => {
    if (!renaming) return;
    field.current?.focus();
    field.current?.select();
  }, [renaming]);

  const choose = (key: string | null) => {
    setChosen(key);
    setDraft(null);
  };
  // The panel's own keys take an Escape pressed in it (below, and the panel's, which closes it).
  useEscapeLayer(
    'highlight',
    row !== null,
    () => {
      if (renaming) setDraft(null);
      else choose(null);
    },
    REVIEW_PANEL,
  );
  const rename = () => {
    if (!ask || !wouldChange(ask)) return;
    handTo.current = { row: rows.findIndex((r) => r.term.key === chosen), after: reading };
    onRename(ask);
    choose(null);
  };

  if (boardTerms(reading).length === 0)
    return <ReviewEmpty>No shared terms yet. A term is a word two notes share.</ReviewEmpty>;
  return (
    <div
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || chosen === null) return;
        // Escape leaves the field first, then lets the term go; the panel stays.
        e.stopPropagation();
        handTo.current = { row: chosen, rename: renaming };
        if (renaming) setDraft(null);
        else choose(null);
      }}
    >
      {contexts.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-slate-200 px-3.5 py-2 dark:border-slate-800">
          <label htmlFor={filterId} className={REVIEW_MUTED}>
            Used in
          </label>
          <Select
            id={filterId}
            size="sm"
            value={shown}
            onChange={(e) => {
              setFilter(e.target.value);
              setDraft(null);
            }}
          >
            <option value={ALL}>All contexts</option>
            {contexts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NONE}>No context</option>
          </Select>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <ReviewEmpty>No shared terms here.</ReviewEmpty>
      ) : (
        <ul ref={list} className="py-1.5">
          {rows.map((r) => {
            const on = r.term.key === chosen;
            return (
              <li key={r.term.key} data-review-term={r.term.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(on ? null : r.term.key)}
                  className={`flex w-[calc(100%-0.5rem)] items-baseline gap-2 px-2.5 py-1.5 text-left ${REVIEW_ROW} ${
                    on ? 'bg-slate-100 dark:bg-slate-800' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[13px] font-medium text-slate-900 dark:text-slate-100">
                      {r.term.term}
                    </span>
                    {r.contexts.length > 0 ? (
                      <span className={`block leading-snug ${REVIEW_MUTED}`}>
                        {r.contexts.join(', ')}
                      </span>
                    ) : null}
                  </span>
                  {r.term.contexts.length > 1 ? (
                    <span className="shrink-0 rounded-full border border-slate-300 px-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
                      {r.term.contexts.length} contexts
                    </span>
                  ) : null}
                  <span className={`shrink-0 tabular-nums ${REVIEW_MUTED}`}>
                    {noteCount(r.notes.length)}
                  </span>
                </button>
                {on && mayWrite ? (
                  <div className="flex items-center gap-1.5 px-3.5 pb-2 pt-1">
                    {draft === null ? (
                      <RowAct data-rename-term="" onClick={() => setDraft(r.term.term)}>
                        Rename Term
                      </RowAct>
                    ) : (
                      <>
                        <label htmlFor={fieldId} className="sr-only">
                          New term for {r.term.term}
                        </label>
                        <input
                          ref={field}
                          id={fieldId}
                          maxLength={TERM_MAX}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) rename();
                          }}
                          className="h-7 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <RowAct disabled={!ask || !wouldChange(ask)} onClick={rename}>
                          Rename
                        </RowAct>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
