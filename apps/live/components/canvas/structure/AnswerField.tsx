'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { HOTSPOT_ANSWER_MAX } from '@livedoc/document';

// The field a hotspot is answered in (docs/specs/021-event-storming/board-structure.md "Hotspot answers"): it opens
// focused and holding the answer, Enter or leaving it keeps what it holds, Escape leaves the answer as it was. An
// answer is one paragraph, so Enter keeps with or without Shift. It says its outcome once: the Enter that keeps is
// followed by the blur of the field going. Put away by a key, it says what had the keyboard before it, so the
// keyboard has somewhere to go back to.

/** From how many characters the counter shows (safe range: 200 to 290; near the limit, never from the start). */
const ANSWER_COUNTER_FROM = 240;

const MUTED = 'text-[11px] text-slate-600 dark:text-slate-400';

export function AnswerField({
  question,
  answer,
  onKeep,
  onLeave,
  onKeyEnd,
}: {
  // The hotspot's words: what the field answers.
  question: string;
  answer: string;
  onKeep: (text: string) => void;
  onLeave: () => void;
  // The field is being put away by a key (Enter, Escape), not by leaving it: called first, with what had the
  // keyboard when the field opened, and whether an answer is being kept.
  onKeyEnd?: (opener: HTMLElement | null, keepsAnswer: boolean) => void;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const [draft, setDraft] = useState(answer);
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const had = document.activeElement;
    opener.current = had instanceof HTMLElement && had !== document.body ? had : null;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);
  const end = (keep: boolean, byKey = false) => {
    if (done.current) return;
    done.current = true;
    if (byKey) onKeyEnd?.(opener.current, keep && draft.trim() !== '');
    if (keep) onKeep(draft);
    else onLeave();
  };
  return (
    <div
      role="group"
      aria-label={`Answer to: ${question}`}
      data-answer-field
      className="rounded-md border border-slate-200 bg-white px-3 pb-2 pt-2.5 shadow-md shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-slate-950/40"
    >
      <label
        htmlFor={id}
        className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
      >
        Answer
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        maxLength={HOTSPOT_ANSWER_MAX}
        value={draft}
        placeholder="What the room decided"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // The canvas's shortcuts are not for what is typed here.
          e.stopPropagation();
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            end(true, true);
          } else if (e.key === 'Escape') end(false, true);
        }}
        onBlur={() => end(true)}
        className="block w-full resize-none rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[13px] leading-snug text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      <p className={`mt-1.5 flex items-baseline justify-between gap-3 ${MUTED}`}>
        <span>Enter keeps it, Esc leaves it</span>
        {draft.length >= ANSWER_COUNTER_FROM ? (
          <span className="tabular-nums">
            {draft.length} / {HOTSPOT_ANSWER_MAX}
          </span>
        ) : null}
      </p>
    </div>
  );
}
