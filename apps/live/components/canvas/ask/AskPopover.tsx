'use client';

import { useState } from 'react';
import { Button, SparkleIcon } from '@livedoc/ui';
import type { Tab } from '@livedoc/document';
import type { AskScope, StormAskHand, StormAskTopic } from '@livedoc/storm-reading';
import { AnchoredPopover } from '@/components/primitives/AnchoredPopover';
import type { AskActions } from '@/hooks/canvas/useAskActions';
import { askModel } from '@/lib/ask';
import { readAskHand } from '@/lib/ask-hand';
import { closeAsk, type AskAnchor } from '@/lib/ask-view';
import { AskAbout } from './AskAbout';
import { AskHands, AskLaneCount, AskTopics } from './AskChoices';

// The Ask popover (docs/specs/021-event-storming/asks.md "Where an ask starts"): top to bottom, the topics the scope
// offers, the lane count for a lane plan, who answers, the prompt with Copy Prompt or Ask for the built-in model,
// Arrange and Reorder with nothing selected, About This Domain, and the declined count with Forget Declined. It
// opens in the suggestions corner, under the Ask pill; Escape closes it and the pill takes the focus back.

const WIDTH = 340;
// How long Copy Prompt says "Copied".
const COPIED_MS = 2000;
const QUIET = 'text-[11px] text-slate-600 dark:text-slate-400';
const LINK =
  'rounded-md text-[11px] font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-brand-300';

export type AskPopoverProps = {
  tab: Pick<Tab, 'id' | 'name' | 'elements' | 'layers' | 'esAbout' | 'esDeclined'>;
  // What the ask was opened about, and what it hangs from.
  scope: AskScope;
  anchor: AskAnchor;
  // The built-in hand is at work, or why it last failed.
  asking: boolean;
  failure: string | null;
  aiEnabled: boolean;
  thisBrowser: boolean;
  board: { document: string; documentId: string; link: string };
  acts: AskActions & { arrange: () => void };
};

export function AskPopover({
  tab,
  scope,
  anchor,
  asking,
  failure,
  aiEnabled,
  thisBrowser,
  board,
  acts,
}: AskPopoverProps) {
  const [topic, setTopic] = useState<StormAskTopic | null>(null);
  const [hand, setHand] = useState<StormAskHand>(readAskHand);
  const [lanes, setLanes] = useState<number | null>(null);
  const [copied, setCopied] = useState<'copied' | 'refused' | null>(null);
  const model = askModel({ tab, scope, topic, hand, lanes, aiEnabled, thisBrowser, board });
  const close = () => closeAsk(tab.id);
  const copy = async () => {
    if (!model.prompt) return;
    const done = await acts.copyPrompt(model.prompt, model.hand);
    setCopied(done ? 'copied' : 'refused');
    if (done) setTimeout(() => setCopied(null), COPIED_MS);
  };
  const asked = { topic: model.topic, scope: model.scope, lanes: model.lanes?.value };

  return (
    <AnchoredPopover
      anchor={anchor}
      name="Ask for Suggestions"
      width={WIDTH}
      alignEnd
      onClose={close}
    >
      <div
        data-testid="ask-popover"
        // The ask is about what is selected: working in here leaves a selected context selected.
        data-keeps-context-selection=""
        className="rounded-lg border border-slate-200 bg-white text-[13px] text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <header className="flex items-center gap-2 px-3.5 pb-1.5 pt-3">
          <SparkleIcon size={15} className="text-brand-700 dark:text-brand-300" />
          <h2 className="text-sm font-semibold">Ask for Suggestions</h2>
          <span className={`ml-auto ${QUIET}`}>{model.about}</span>
        </header>
        <AskTopics topics={model.topics} topic={model.topic} onPick={setTopic} />
        {model.lanes ? <AskLaneCount lanes={model.lanes} onChange={setLanes} /> : null}

        <div className="px-3.5 pb-3">
          <AskHands hands={model.hands} hand={model.hand} onPick={setHand} />
          {model.prompt ? (
            <>
              <pre
                tabIndex={0}
                aria-label="Prompt"
                className="mt-2.5 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-sans text-[11.5px] leading-normal text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                {model.prompt}
              </pre>
              <div className="mt-2 flex items-center justify-end gap-2">
                <p role="status" className={`min-w-0 flex-1 ${QUIET}`}>
                  {copied === 'copied'
                    ? 'Paste it into your agent. Its suggestions appear here as it works.'
                    : copied === 'refused'
                      ? 'Could not copy. Select the prompt and copy it by hand.'
                      : null}
                </p>
                <Button size="xs" onClick={() => void copy()}>
                  {copied === 'copied' ? 'Copied' : 'Copy Prompt'}
                </Button>
              </div>
            </>
          ) : null}
          {model.unreachable ? (
            <p className="mt-2.5 text-xs leading-normal text-slate-700 dark:text-slate-300">
              {model.unreachable}
            </p>
          ) : null}
          {model.hand === 'built-in' ? (
            <>
              <p className={`mt-2.5 leading-normal ${QUIET}`}>
                The deployment’s small model answers here. Nothing changes until you apply a
                suggestion.
              </p>
              {failure ? (
                <p
                  role="alert"
                  className="mt-2 text-xs leading-normal text-red-700 dark:text-red-300"
                >
                  {failure}
                </p>
              ) : null}
              <div className="mt-2 flex items-center justify-end gap-2">
                <p role="status" className={`min-w-0 flex-1 ${QUIET}`}>
                  {asking ? 'Asking the model…' : null}
                </p>
                {asking ? (
                  <Button variant="secondary" size="xs" onClick={acts.cancelAsk}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="xs" onClick={() => void acts.ask(asked)}>
                    Ask
                  </Button>
                )}
              </div>
            </>
          ) : null}
          {model.lanes ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={QUIET}>Or the board’s own fold, with no model</span>
              <button
                type="button"
                onClick={() => acts.foldBoard(model.lanes!.value)}
                className={LINK}
              >
                Fold the Lanes
              </button>
            </div>
          ) : null}
        </div>

        {model.arrange ? (
          <button
            type="button"
            onClick={() => {
              close();
              acts.arrange();
            }}
            className="flex w-full items-center border-t border-slate-200 px-3.5 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:border-slate-800 dark:hover:bg-slate-800/60"
          >
            Arrange and Reorder
            <span className={`ml-auto ${QUIET}`}>Along the timeline, no model</span>
          </button>
        ) : null}

        <AskAbout about={model.aboutText} onSave={acts.saveAbout} />
        {model.declined > 0 ? (
          <div className="-mt-1 flex items-center px-3.5 pb-3">
            <span className={QUIET}>{model.declined} declined</span>
            <button type="button" onClick={acts.forgetDeclined} className={`ml-auto ${LINK}`}>
              Forget Declined
            </button>
          </div>
        ) : null}
      </div>
    </AnchoredPopover>
  );
}
