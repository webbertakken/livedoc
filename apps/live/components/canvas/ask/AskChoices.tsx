'use client';

import { useId } from 'react';
import { Glyph, PlusIcon } from '@livedoc/ui';
import type { StormAskHand, StormAskTopic } from '@livedoc/storm-reading';
import type { AskModel } from '@/lib/ask';

// What a person picks in the Ask popover (docs/specs/021-event-storming/asks.md "Where an ask starts"): the topic
// the scope offers, the lane count for a lane plan, and who answers. Radio groups, so the arrow keys move a choice.

const FOCUS_WITHIN =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand-600';
const LEGEND = 'mb-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400';

export function AskTopics({
  topics,
  topic,
  onPick,
}: {
  topics: AskModel['topics'];
  topic: StormAskTopic;
  onPick: (topic: StormAskTopic) => void;
}) {
  const name = useId();
  return (
    <fieldset className="px-1.5 pb-2">
      <legend className="sr-only">What to ask for</legend>
      {topics.map(({ topic: offered, menu }) => {
        const on = offered === topic;
        return (
          <label
            key={offered}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 ${FOCUS_WITHIN} ${
              on
                ? 'bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
            }`}
          >
            <input
              type="radio"
              name={name}
              checked={on}
              onChange={() => onPick(offered)}
              className="size-3.5 accent-brand-600"
            />
            {menu}
          </label>
        );
      })}
    </fieldset>
  );
}

const STEP_BUTTON =
  'flex size-7 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-800';

export function AskLaneCount({
  lanes,
  onChange,
}: {
  lanes: NonNullable<AskModel['lanes']>;
  onChange: (count: number) => void;
}) {
  const label = useId();
  return (
    <div className="flex items-center justify-between px-3.5 pb-2.5">
      <span id={label} className="text-xs text-slate-700 dark:text-slate-300">
        Lanes
      </span>
      <div role="group" aria-labelledby={label} className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Fewer lanes"
          disabled={lanes.value <= lanes.min}
          onClick={() => onChange(lanes.value - 1)}
          className={STEP_BUTTON}
        >
          <Glyph size={14} units={24}>
            <path d="M5 12h14" />
          </Glyph>
        </button>
        <output aria-live="polite" className="w-6 text-center text-sm font-semibold tabular-nums">
          {lanes.value}
        </output>
        <button
          type="button"
          aria-label="More lanes"
          disabled={lanes.value >= lanes.max}
          onClick={() => onChange(lanes.value + 1)}
          className={STEP_BUTTON}
        >
          <PlusIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// Who each hand is, and the line under its name.
const HANDS: Record<StormAskHand, { name: string; note: string }> = {
  cli: { name: 'CLI', note: 'Recommended' },
  mcp: { name: 'MCP', note: 'AI tool' },
  'built-in': { name: 'Built-in', note: 'Small model' },
};

export function AskHands({
  hands,
  hand,
  onPick,
}: {
  hands: StormAskHand[];
  hand: StormAskHand;
  onPick: (hand: StormAskHand) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className={LEGEND}>Who answers</legend>
      <div className="flex gap-1 rounded-[10px] bg-slate-100 p-[3px] dark:bg-slate-800">
        {hands.map((offered) => {
          const on = offered === hand;
          return (
            <label
              key={offered}
              className={`flex-1 cursor-pointer rounded-[7px] px-1 py-1.5 text-center text-xs ${FOCUS_WITHIN} ${
                on
                  ? 'bg-white font-semibold text-slate-900 shadow-sm shadow-slate-900/10 dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={on}
                onChange={() => onPick(offered)}
                className="sr-only"
              />
              {HANDS[offered].name}
              <span className="block text-[10px] font-normal text-slate-600 dark:text-slate-400">
                {HANDS[offered].note}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
