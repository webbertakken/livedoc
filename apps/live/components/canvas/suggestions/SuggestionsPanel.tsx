'use client';

import { useId, type ReactNode } from 'react';
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  Portal,
  SparkleIcon,
  SwitchRow,
} from '@livedoc/ui';
import { eventStormingNote, type CandidateContextElement, type Rect } from '@livedoc/document';
import type { SuggestionElement } from '@/lib/suggestion-hints';
import { suggestionName } from './SuggestionPlaceholder';
import {
  SUGGESTION_STROKE_BORDER,
  SUGGESTION_STROKE_TEXT,
  SUGGESTION_TINT,
  suggestionStrokeVars,
} from './suggestion-colours';

// The suggestions panel (docs/specs/021-event-storming/suggestions.md "How a person sees them"): the only chrome
// the feature adds. Collapsed by default to a button saying how many; expanded, every suggestion in timeline order
// with ✓ and ✕, Show All Suggestions, Apply All and Dismiss All. Pointing at a row, or focusing it, brings its
// anchor and spot into view and previews it on the board. Suggested candidate contexts are listed among the notes,
// at their leftmost note (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and decides").

export type PanelRow =
  | { type: 'note'; suggestion: SuggestionElement; spot: Rect; anchor: Rect }
  | { type: 'context'; context: CandidateContextElement; bounds: Rect; notes: number };

export const panelRowId = (row: PanelRow) =>
  row.type === 'note' ? row.suggestion.id : row.context.id;

const countLabel = (n: number) => `${n} suggestion${n === 1 ? '' : 's'}`;
const noteCount = (n: number) => `${n} note${n === 1 ? '' : 's'}`;

// One row's face: its swatch, its kind and words (or a context's name and size), and the reason.
function rowFace(row: PanelRow): {
  name: string;
  swatch: ReactNode;
  kind: ReactNode;
  words: string;
  reason?: string;
  style?: React.CSSProperties;
} {
  if (row.type === 'context') {
    const c = row.context;
    return {
      name: `Candidate context: ${c.label}`,
      swatch: (
        <span
          aria-hidden
          className="mt-0.5 size-4 shrink-0 rounded-[5px] border-2 border-dashed border-slate-500 dark:border-slate-400"
        />
      ),
      kind: (
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Context</span>
      ),
      words: `${c.label} · ${noteCount(row.notes)}`,
      reason: c.esContext.suggestion?.reason,
    };
  }
  const s = row.suggestion;
  return {
    name: suggestionName(s),
    swatch: (
      <span
        aria-hidden
        className={`mt-0.5 size-4 shrink-0 rounded-[3px] border-2 border-dashed ${SUGGESTION_TINT} ${SUGGESTION_STROKE_BORDER}`}
      />
    ),
    kind: (
      <span className={`text-xs font-semibold ${SUGGESTION_STROKE_TEXT}`}>
        {eventStormingNote(s.esKind).label}
      </span>
    ),
    words: s.label ?? '',
    reason: s.esSuggestion.reason,
    style: suggestionStrokeVars(s.esKind),
  };
}

export function SuggestionsPanel({
  rows,
  open,
  showAll,
  onOpenChange,
  onShowAllChange,
  onPreview,
  onLeave,
  onApply,
  onDismiss,
  onApplyAll,
  onDismissAll,
}: {
  rows: PanelRow[];
  open: boolean;
  showAll: boolean;
  onOpenChange: (open: boolean) => void;
  onShowAllChange: (showAll: boolean) => void;
  onPreview: (row: PanelRow) => void;
  onLeave: (row: PanelRow) => void;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  onApplyAll: () => void;
  onDismissAll: () => void;
}) {
  const listId = useId();
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={listId}
      onClick={() => onOpenChange(!open)}
      className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-slate-100 dark:hover:bg-slate-800"
    >
      <SparkleIcon size={14} className="text-brand-700 dark:text-brand-300" />
      {countLabel(rows.length)}
      <ChevronDownIcon
        size={14}
        className={`text-slate-500 transition motion-reduce:transition-none dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  );
  return (
    <Portal>
      <aside
        aria-label="Suggestions"
        data-testid="suggestions-panel"
        className={`fixed right-3 top-16 z-[var(--z-overlay)] flex max-h-[calc(100vh-10rem)] flex-col border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-slate-950/40 ${
          open ? 'w-[320px] rounded-xl' : 'rounded-full'
        }`}
      >
        <div className={open ? 'border-b border-slate-200 p-1.5 dark:border-slate-800' : 'p-0.5'}>
          {toggle}
        </div>
        {open ? (
          <>
            <ol id={listId} className="min-h-0 flex-1 overflow-y-auto py-1">
              {rows.map((row) => {
                const id = panelRowId(row);
                const face = rowFace(row);
                return (
                  <li
                    key={id}
                    tabIndex={0}
                    aria-label={face.name}
                    data-suggestion-row={id}
                    onPointerEnter={() => onPreview(row)}
                    onPointerLeave={() => onLeave(row)}
                    onFocus={() => onPreview(row)}
                    onBlur={() => onLeave(row)}
                    className="flex gap-3 px-4 py-2.5 outline-none hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
                    style={face.style}
                  >
                    {face.swatch}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        {face.kind} <span className="font-medium">{face.words}</span>
                      </p>
                      {face.reason ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                          {face.reason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <button
                        type="button"
                        aria-label={`Apply suggestion: ${face.name}`}
                        onClick={() => onApply(id)}
                        className="flex size-7 items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      >
                        <CheckIcon size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Dismiss suggestion: ${face.name}`}
                        onClick={() => onDismiss(id)}
                        className="flex size-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-col gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
              <SwitchRow
                checked={showAll}
                onChange={onShowAllChange}
                className="px-1 text-sm text-slate-800 dark:text-slate-100"
              >
                Show All Suggestions
              </SwitchRow>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="xs" onClick={onDismissAll}>
                  Dismiss All
                </Button>
                <Button variant="primary" size="xs" onClick={onApplyAll}>
                  Apply All
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </aside>
    </Portal>
  );
}
