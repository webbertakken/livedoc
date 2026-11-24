'use client';

import { useEffect, useRef } from 'react';
import { SparkleIcon } from '@livedoc/ui';
import { closeAsk, setAskAnchor, useAskView } from '@/lib/ask-view';

// The Ask pill (docs/specs/021-event-storming/asks.md "Where an ask starts"): beside the suggestions count, top
// right, one home for asking and for what comes back. It opens the Ask popover about what is selected, and is what
// the popover hangs from: the corner it stands in, with the pill taking the focus back.
export function AskButton({ tabId, onAsk }: { tabId: string; onAsk: () => void }) {
  const pill = useRef<HTMLButtonElement>(null);
  const open = useAskView(tabId).open;
  useEffect(() => {
    const button = pill.current;
    if (!button) return;
    const corner = button.closest('aside') ?? button;
    setAskAnchor(tabId, {
      getBoundingClientRect: () => corner.getBoundingClientRect(),
      focus: (options) => button.focus(options),
      contains: (node) => corner.contains(node),
    });
    return () => setAskAnchor(tabId, null);
  }, [tabId]);
  return (
    <button
      ref={pill}
      type="button"
      data-ask-button=""
      // Asking is about what is selected: a press here leaves a selected context selected.
      data-keeps-context-selection=""
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => (open ? closeAsk(tabId) : onAsk())}
      className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-body text-slate-900 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
    >
      <SparkleIcon size={14} className="text-brand-700 dark:text-brand-300" />
      <span className="text-optical-centre">Ask</span>
    </button>
  );
}
