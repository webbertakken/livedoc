'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@livedoc/ui';
import {
  EVENT_STORMING_NOTES,
  type ElementId,
  type EventStormingNoteKind,
} from '@livedoc/document';
import { storySteps, type StormReading, type StoryStep } from '@livedoc/storm-reading';
import { KindSwatch, REVIEW_HEADING, REVIEW_MUTED, ReviewEmpty, RowAct } from './review-parts';

// The Story tab (docs/specs/021-event-storming/board-review.md "Story"): the timeline told as sentences, one step
// per event, walked with Next and Previous or the arrow keys while the list has the focus. The step in hand is
// highlighted, and its notes are ringed and brought into view. A pivotal event's step is followed by a rule naming
// the phase it closes; the loose notes follow the last step, by kind.

const LINE = 'flex items-baseline gap-2 text-body';
const ID_SEPARATOR = '\u0000';

function Line({
  kind,
  strong,
  children,
}: {
  kind: EventStormingNoteKind;
  strong?: boolean;
  children: string;
}) {
  return (
    <span
      className={`${LINE} ${strong ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}
    >
      <span className="-translate-y-px">
        <KindSwatch kind={kind} />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function StepLines({ step }: { step: StoryStep }) {
  return (
    <>
      {step.leads.map((lead, i) => (
        <Line key={`lead:${i}`} kind="command">
          {lead}
        </Line>
      ))}
      {step.deciders.map((decider, i) => (
        <Line key={`decider:${i}`} kind="aggregate">
          {decider}
        </Line>
      ))}
      <Line kind="domain-event" strong>
        {step.happens}
      </Line>
      {step.follows.map((follow, i) => (
        <Line key={`follow:${i}`} kind="policy">
          {follow}
        </Line>
      ))}
      {step.questions.map((question, i) => (
        <Line key={`question:${i}`} kind="hotspot">
          {question}
        </Line>
      ))}
    </>
  );
}

export function ReviewStory({
  reading,
  onRing,
  onWalked,
}: {
  reading: StormReading;
  // Ring these notes and bring them into view; none lets go.
  onRing: (ids: readonly ElementId[]) => void;
  // A step was taken in hand: the story is being walked.
  onWalked: () => void;
}) {
  const listId = useId();
  const steps = storySteps(reading);
  // The step in hand, by its event: it stays in hand while the board changes round it.
  const [inHand, setInHand] = useState<ElementId | null>(null);
  const index = steps.findIndex((s) => s.event === inHand);
  const step = index < 0 ? null : steps[index]!;
  // The notes of a step are a new array each reading; their ids say whether what is ringed changed.
  const ringed = step ? step.notes.join(ID_SEPARATOR) : '';
  useEffect(() => {
    onRing(ringed ? ringed.split(ID_SEPARATOR) : []);
  }, [ringed, onRing]);
  const take = (next: number) => {
    const target = steps[Math.min(Math.max(next, 0), steps.length - 1)];
    if (!target || target.event === inHand) return;
    setInHand(target.event);
    onWalked();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const to =
      e.key === 'ArrowDown'
        ? index + 1
        : e.key === 'ArrowUp'
          ? index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? steps.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    take(to);
  };
  if (steps.length === 0)
    return <ReviewEmpty>No events yet. The story starts with one.</ReviewEmpty>;
  const words = new Map(reading.notes.map((n) => [n.id, n]));
  const loose = EVENT_STORMING_NOTES.flatMap(({ kind }) =>
    reading.loose.map((id) => words.get(id)!).filter((n) => n.kind === kind),
  );
  const optionId = (event: ElementId) => `${listId}-${event}`;
  return (
    <>
      <ol
        id={listId}
        role="listbox"
        aria-label="The story, step by step"
        aria-activedescendant={step ? optionId(step.event) : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        {steps.map((s, i) => (
          <li
            key={s.event}
            id={optionId(s.event)}
            role="option"
            aria-selected={s.event === inHand}
            data-review-step={s.event}
            onClick={() => take(i)}
            className={`mx-1 my-px cursor-pointer rounded-menu px-3 py-2 ${
              s.event === inHand
                ? 'bg-slate-100 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:ring-slate-700'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <span className="flex gap-3">
              <span
                className={`w-3.5 shrink-0 text-right text-supporting leading-[19px] tabular-nums ${REVIEW_MUTED}`}
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <StepLines step={s} />
              </span>
            </span>
            {s.closesPhase ? (
              <span
                className={`mt-1.5 flex items-center gap-3 pl-6 text-supporting ${REVIEW_MUTED}`}
              >
                <span
                  aria-hidden
                  className="h-icon-row w-1.5 shrink-0 rounded-full bg-slate-400/80"
                />
                {s.happens} closes a phase
                <span aria-hidden className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {loose.length > 0 ? (
        <section
          aria-label="Loose notes"
          className="border-t border-slate-200 pb-2 dark:border-slate-800"
        >
          <h3 className={REVIEW_HEADING}>Loose notes</h3>
          <ul className="flex flex-col px-4">
            {loose.map((n) => (
              <li key={n.id}>
                <Line kind={n.kind}>{n.words || '(blank)'}</Line>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white py-2 pl-4 pr-3 dark:border-slate-800 dark:bg-slate-900">
        <span aria-live="polite" className={`mr-auto tabular-nums ${REVIEW_MUTED}`}>
          {step
            ? `Step ${index + 1} of ${steps.length}`
            : `${steps.length} step${steps.length === 1 ? '' : 's'}`}
        </span>
        <RowAct
          lead={<ChevronLeftIcon size={13} />}
          disabled={index <= 0}
          onClick={() => take(index - 1)}
        >
          Previous
        </RowAct>
        <RowAct
          trail={<ChevronRightIcon size={13} />}
          disabled={index >= steps.length - 1}
          onClick={() => take(index + 1)}
        >
          Next
        </RowAct>
      </div>
    </>
  );
}
