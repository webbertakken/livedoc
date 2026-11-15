'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ABOUT_MAX } from '@livedoc/document';

// About This Domain (docs/specs/021-event-storming/asks.md "About This Domain"): what the person says the domain
// is, kept when they leave the field or close the popover, as one undoable step. The counter shows near the limit.

// How close to the limit the counter appears.
const COUNTER_WITHIN = 200;

export function AskAbout({ about, onSave }: { about: string; onSave: (text: string) => void }) {
  const field = useId();
  const [draft, setDraft] = useState(about);
  // The About changed under the field (an undo, someone else's edit): the field follows.
  const [seen, setSeen] = useState(about);
  if (about !== seen) {
    setSeen(about);
    setDraft(about);
  }
  const latest = useRef({ draft, onSave });
  useEffect(() => {
    latest.current = { draft, onSave };
  });
  // Closing the popover leaves the field too.
  useEffect(() => () => latest.current.onSave(latest.current.draft), []);
  return (
    <div className="border-t border-slate-200 px-3.5 pb-3 pt-2.5 dark:border-slate-800">
      <label
        htmlFor={field}
        className="mb-1.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-400"
      >
        About This Domain
      </label>
      <textarea
        id={field}
        rows={2}
        maxLength={ABOUT_MAX}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft)}
        placeholder="The business, who uses it, words to prefer or avoid"
        className="block w-full resize-y rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
      />
      {draft.length > ABOUT_MAX - COUNTER_WITHIN ? (
        <p className="mt-1 text-right text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
          {draft.length.toLocaleString('en-GB')} / {ABOUT_MAX.toLocaleString('en-GB')}
        </p>
      ) : null}
    </div>
  );
}
