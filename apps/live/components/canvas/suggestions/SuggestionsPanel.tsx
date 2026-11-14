'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  Button,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  Portal,
  SparkleIcon,
  SwitchRow,
} from '@livedoc/ui';
import { eventStormingNote } from '@livedoc/document';
import { changeWords } from '@/lib/change-caption';
import type { MergeRow, NamesRow } from '@/lib/suggested-changes';
import { panelRowId, type PanelRow } from '@/lib/suggestion-rows';
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
// at their leftmost note (docs/specs/021-event-storming/candidate-contexts.md "How a person sees and decides"), and
// so are the changes suggested to what is already there (docs/specs/021-event-storming/suggested-changes.md): a row
// per note change, with Everywhere for a reword that reaches further, a Names row per context that holds names, and
// a Merge row per set of contexts a name was suggested for. A Names or a Merge row is chosen as a whole: it selects
// its contexts, whose chips on the board decide. The open lane plan is listed before them all
// (docs/specs/021-event-storming/lane-plans.md "How a person sees and decides"): a stale one holds ✕ alone.

/** A row that is decided where it stands: applied with ✓. */
export type DecidedRow = Exclude<PanelRow, NamesRow | MergeRow>;
/** A row that is chosen as a whole: it selects its contexts, which show their chips. */
export type ChosenRow = NamesRow | MergeRow;

const countLabel = (n: number) => `${n} suggestion${n === 1 ? '' : 's'}`;
const noteCount = (n: number) => `${n} note${n === 1 ? '' : 's'}`;

type RowFace = {
  name: string;
  // What the row itself is called when its name is not all there is to say (a stale lane plan).
  said?: string;
  // A row chosen as a whole says what it holds, for its buttons: "name suggestions for Ordering".
  holds?: string;
  swatch: ReactNode;
  kind: ReactNode;
  words: string;
  detail?: string;
  // A row with no caption on the board to say them says its reason whole, and who suggested it beneath.
  whole?: boolean;
  by?: string;
  style?: CSSProperties;
};

const CONTEXT_SWATCH = (
  <span
    aria-hidden
    className="mt-0.5 size-4 shrink-0 rounded-[5px] border-2 border-dashed border-slate-500 dark:border-slate-400"
  />
);
const NOTE_SWATCH = (
  <span
    aria-hidden
    className={`mt-0.5 size-4 shrink-0 rounded-[3px] border-2 border-dashed ${SUGGESTION_TINT} ${SUGGESTION_STROKE_BORDER}`}
  />
);
// A lane plan: the dashed outline ruled in two lanes.
const LANES_SWATCH = (
  <span
    aria-hidden
    className="mt-0.5 flex size-4 shrink-0 items-center rounded-[5px] border-2 border-dashed border-slate-500 dark:border-slate-400"
  >
    <span className="w-full border-t-2 border-dashed border-slate-500 dark:border-slate-400" />
  </span>
);
/** What a plan made for an older board says (lane-plans.md "What must stay true"). */
export const STALE_PLAN = 'The board changed since this plan was made. Ask again.';
const contextKind = (word: string) => (
  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{word}</span>
);
const noteKind = (word: string) => (
  <span className={`text-xs font-semibold ${SUGGESTION_STROKE_TEXT}`}>{word}</span>
);

// One row's face: its swatch, what it is, its words, and the reason or the names beneath.
function rowFace(row: PanelRow): RowFace {
  switch (row.type) {
    case 'context': {
      const c = row.context;
      return {
        name: `Candidate context: ${c.label}`,
        swatch: CONTEXT_SWATCH,
        kind: contextKind('Context'),
        words: `${c.label} · ${noteCount(row.notes)}`,
        detail: c.esContext.suggestion?.reason,
      };
    }
    case 'names':
      return {
        name: `Name suggestions for ${row.context.label}`,
        holds: `name suggestions for ${row.context.label}`,
        swatch: CONTEXT_SWATCH,
        kind: contextKind('Names'),
        words: row.context.label,
        detail: row.names.map((n) => n.name).join(', '),
      };
    case 'merge': {
      const labels = row.contexts.map((c) => c.label);
      return {
        name: `Name suggestions for ${labels.join(' and ')} merged`,
        holds: `name suggestions for ${labels.join(' and ')} merged`,
        swatch: CONTEXT_SWATCH,
        kind: contextKind('Merge'),
        words: labels.join(' + '),
        detail: row.names.map((n) => n.name).join(', '),
      };
    }
    case 'lane-plan': {
      const { reason, by } = row.plan.esLanePlan;
      const lanes = `${row.lanes} lane${row.lanes === 1 ? '' : 's'}`;
      return {
        name: `Lane plan: ${lanes}`,
        ...(row.stale ? { said: `Lane plan: ${lanes}. ${STALE_PLAN}` } : {}),
        swatch: LANES_SWATCH,
        kind: contextKind('Lane plan'),
        words: lanes,
        detail: row.stale ? STALE_PLAN : reason,
        whole: true,
        ...(by && !row.stale ? { by } : {}),
      };
    }
    case 'change': {
      const { title, what } = changeWords(row.note, row.change);
      return {
        name: `${title} ${what}`,
        swatch: NOTE_SWATCH,
        kind: noteKind(title),
        words: what,
        detail: row.change.reason,
        style: suggestionStrokeVars(row.kind),
      };
    }
    case 'note': {
      const s = row.suggestion;
      return {
        name: suggestionName(s),
        swatch: NOTE_SWATCH,
        kind: noteKind(eventStormingNote(s.esKind).label),
        words: s.label ?? '',
        detail: s.esSuggestion.reason,
        style: suggestionStrokeVars(s.esKind),
      };
    }
  }
}

const ICON_BUTTON =
  'flex size-7 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand-600';
const DISMISS_BUTTON = `${ICON_BUTTON} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`;

export function SuggestionsPanel({
  rows,
  open,
  showAll,
  onOpenChange,
  onShowAllChange,
  onPreview,
  onLeave,
  onApply,
  onChoose,
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
  // Apply a suggestion or accept a change; `everywhere` for a reword across the whole board.
  onApply: (row: DecidedRow, everywhere?: boolean) => void;
  onChoose: (row: ChosenRow) => void;
  onDismiss: (row: PanelRow) => void;
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
                const chosen = row.type === 'names' || row.type === 'merge';
                const words = (
                  <>
                    <p className="text-sm">
                      {face.kind} <span className="font-medium">{face.words}</span>
                    </p>
                    {face.detail ? (
                      <p
                        className={`mt-0.5 text-xs text-slate-600 dark:text-slate-300 ${face.whole ? '' : 'line-clamp-2'}`}
                      >
                        {face.detail}
                      </p>
                    ) : null}
                    {face.by ? (
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        Suggested by {face.by}
                      </p>
                    ) : null}
                  </>
                );
                return (
                  <li
                    key={id}
                    tabIndex={0}
                    aria-label={face.said ?? face.name}
                    data-suggestion-row={id}
                    onPointerEnter={() => onPreview(row)}
                    onPointerLeave={() => onLeave(row)}
                    onFocus={() => onPreview(row)}
                    onBlur={() => onLeave(row)}
                    className="flex gap-3 px-4 py-2.5 outline-none hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
                    style={face.style}
                  >
                    {face.swatch}
                    {chosen ? (
                      <button
                        type="button"
                        aria-label={`Show ${face.holds}`}
                        onClick={() => onChoose(row)}
                        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        {words}
                      </button>
                    ) : (
                      <div className="min-w-0 flex-1">
                        {words}
                        {row.type === 'change' && row.beyond > 0 ? (
                          <button
                            type="button"
                            aria-label={`Apply everywhere: ${face.name}`}
                            onClick={() => onApply(row, true)}
                            className="mt-1 rounded-md text-xs font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-brand-300"
                          >
                            Everywhere
                          </button>
                        ) : null}
                      </div>
                    )}
                    <div className="flex shrink-0 items-start gap-1">
                      {chosen || (row.type === 'lane-plan' && row.stale) ? null : (
                        <button
                          type="button"
                          aria-label={`Apply suggestion: ${face.name}`}
                          onClick={() => onApply(row)}
                          className={`${ICON_BUTTON} text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950`}
                        >
                          <CheckIcon size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={
                          chosen ? `Dismiss ${face.holds}` : `Dismiss suggestion: ${face.name}`
                        }
                        onClick={() => onDismiss(row)}
                        className={DISMISS_BUTTON}
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
