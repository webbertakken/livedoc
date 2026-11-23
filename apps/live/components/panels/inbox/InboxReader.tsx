'use client';

// The Inbox's reading pane (docs/specs/013-workspace/inbox.md §1.4, §1.5): where the row is, its title, who and why
// in a sentence, the verbs with their keys (Reply, Resolve or Mark Done where the page can carry them out; Open
// always), the body (./InboxReaderBody), and a reply field where Reply is offered.
// The pane's handle lets the Inbox's keys reach its verbs.

import Link from 'next/link';
import { useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { lucideGlyph, SOLID_BRAND_DARK_CONTROL } from '@livedoc/ui';
import {
  lucideArrowLeft,
  lucideArrowRight,
  lucideCheck,
  lucideCircleCheck,
  lucideMessageSquare,
} from '@livedoc/icons/lucide';
import { keyLabel } from '@/lib/key-label';
import { formatRelativeTimeShort, useRelativeNow } from '@/lib/relative-time';
import { track } from '@/lib/telemetry';
import { entryFacts, entryHref, firstName, type InboxEntry } from './inbox-entries';
import { offeredVerbs, replyToThread, resolveThread, type InboxDone } from './inbox-verbs';
import { useInboxThread } from './useInboxThread';
import { InboxReaderBody } from './InboxReaderBody';
import { ReasonIcon } from './InboxRows';

const BackGlyph = lucideGlyph(lucideArrowLeft, 16);
const OpenGlyph = lucideGlyph(lucideArrowRight, 15);
const ReplyGlyph = lucideGlyph(lucideMessageSquare, 15);
const ResolveGlyph = lucideGlyph(lucideCircleCheck, 15);
const DoneGlyph = lucideGlyph(lucideCheck, 15);

export type InboxReaderHandle = {
  /** Focuses the reply field; false where Reply is not offered. */
  reply: () => boolean;
  /** Resolves or marks done; false where neither is offered. */
  primary: () => boolean;
  /** Follows Open. */
  open: () => void;
  focusTitle: () => void;
};

type Failure = 'reply' | 'resolve' | 'done';

const FAILURE_COPY: Record<Failure, string> = {
  reply: "Couldn't send your reply. Try again, or open the document to reply there.",
  resolve: "Couldn't resolve the thread.",
  done: "Couldn't mark it done.",
};

const VERB =
  'inline-flex items-center gap-1 rounded-control px-3 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none';
const PRIMARY = `${VERB} bg-brand-700 font-medium text-white hover:bg-brand-800 ${SOLID_BRAND_DARK_CONTROL}`;
const SECONDARY = `${VERB} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700`;
const KBD =
  'rounded-control border border-current/30 px-1 font-mono text-glyph opacity-80 pointer-coarse:hidden';

export function InboxReader({
  ref,
  entry,
  ownerId,
  done,
  stacked,
  onBack,
  onGone,
  announce,
}: {
  ref?: Ref<InboxReaderHandle>;
  entry: InboxEntry;
  ownerId: string;
  done: InboxDone | null;
  stacked: boolean;
  onBack?: () => void;
  onGone: (key: string) => void;
  announce: (message: string) => void;
}) {
  const f = entryFacts(entry);
  const href = entryHref(entry);
  const verbs = offeredVerbs(entry, done);
  const canReply = verbs.includes('reply');
  const primary = verbs.includes('resolve') ? 'resolve' : verbs.includes('done') ? 'done' : null;
  const now = useRelativeNow();
  const titleId = useId();
  const replyId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef<HTMLAnchorElement>(null);
  const [busy, setBusy] = useState<Failure | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<{ text: string; at: number }[]>([]);
  const [bump, setBump] = useState(0);
  // A new row: a fresh draft, no stale error (D189).
  const [shownKey, setShownKey] = useState(entry.key);
  if (shownKey !== entry.key) {
    setShownKey(entry.key);
    setDraft('');
    setFailed(null);
    setSent([]);
  }
  const thread = useInboxThread(ownerId, entry, bump);

  const runPrimary = async () => {
    if (!primary || busy) return;
    setBusy(primary);
    setFailed(null);
    try {
      if (primary === 'resolve' && entry.kind === 'Thread') {
        await resolveThread(ownerId, entry.row, thread ?? null);
        track('Activity', 'Resolved', 'Thread');
        announce(`Resolved ${f.title}`);
      } else if (primary === 'done' && entry.kind === 'Action' && done) {
        done.markDone(entry.row.elementId, entry.row.id);
        track('Activity', 'Resolved', 'Action');
        announce(`Marked ${f.title} done`);
      } else {
        return;
      }
      onGone(entry.key);
    } catch (err) {
      console.warn(`[inbox] ${primary}-failed`, err);
      setFailed(primary);
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !canReply || entry.kind !== 'Thread') return;
    setBusy('reply');
    setFailed(null);
    try {
      await replyToThread(ownerId, entry.row, text);
      track('Activity', 'Added', 'Reply');
      setDraft('');
      setSent((s) => [...s, { text, at: Date.now() }]);
      setBump((n) => n + 1);
      announce('Reply sent');
    } catch (err) {
      console.warn('[inbox] reply-failed', err);
      setFailed('reply');
    } finally {
      setBusy(null);
    }
  };

  useImperativeHandle(ref, () => ({
    reply: () => {
      if (!canReply) return false;
      replyRef.current?.focus();
      return true;
    },
    primary: () => {
      if (!primary) return false;
      void runPrimary();
      return true;
    },
    open: () => openRef.current?.click(),
    focusTitle: () => titleRef.current?.focus(),
  }));

  const target = stacked ? 'min-h-11' : 'min-h-field';
  const replyTo = firstName(f.person?.name) ?? 'the thread';

  return (
    <section
      aria-labelledby={titleId}
      data-inbox-reader={entry.kind}
      className="flex min-w-0 flex-col gap-3"
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-control px-2 text-body text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white`}
        >
          <BackGlyph />
          Back to Inbox
        </button>
      ) : null}
      <nav
        aria-label="Where it is"
        className="flex min-w-0 flex-wrap items-center gap-1 text-supporting text-slate-500 dark:text-slate-400"
      >
        {[f.document.name, ...f.where].map((part, i) => (
          <span key={`${i}:${part}`} className="inline-flex min-w-0 items-center gap-1">
            {i > 0 ? <span aria-hidden>›</span> : null}
            <span className="truncate">{part}</span>
          </span>
        ))}
        {f.local ? <span className="font-medium">· This Browser</span> : null}
      </nav>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="break-words text-name text-slate-900 outline-none dark:text-slate-50"
      >
        {f.title}
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-body text-slate-600 dark:text-slate-300">
        {f.reason ? (
          <span aria-hidden className="text-slate-500 dark:text-slate-400">
            <ReasonIcon kind={f.reason.kind} />
          </span>
        ) : null}
        <span>
          {f.byline} · {formatRelativeTimeShort(now - entry.at)}
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2" data-inbox-verbs="">
        {canReply ? (
          <button
            type="button"
            onClick={() => replyRef.current?.focus()}
            aria-keyshortcuts="r"
            className={`${PRIMARY} ${target}`}
          >
            <ReplyGlyph />
            Reply
            <kbd aria-hidden className={KBD}>
              r
            </kbd>
          </button>
        ) : null}
        {primary ? (
          <button
            type="button"
            onClick={() => void runPrimary()}
            disabled={busy !== null}
            aria-keyshortcuts="e"
            className={`${canReply ? SECONDARY : PRIMARY} ${target}`}
          >
            {primary === 'resolve' ? <ResolveGlyph /> : <DoneGlyph />}
            {primary === 'resolve' ? 'Resolve' : 'Mark Done'}
            <kbd aria-hidden className={KBD}>
              e
            </kbd>
          </button>
        ) : null}
        <Link
          ref={openRef}
          href={href}
          onClick={() => track('Activity', 'Selected', entry.kind)}
          aria-keyshortcuts="Enter"
          className={`${canReply || primary ? SECONDARY : PRIMARY} ${target}`}
        >
          <OpenGlyph />
          Open
          <kbd aria-hidden className={KBD}>
            ↵
          </kbd>
        </Link>
      </div>
      {failed ? (
        <p role="alert" className="text-body text-red-700 dark:text-red-300">
          {FAILURE_COPY[failed]}
        </p>
      ) : null}

      <InboxReaderBody entry={entry} thread={thread} sent={sent} now={now} />

      {canReply ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={replyId} className="sr-only">
            Reply
          </label>
          <textarea
            id={replyId}
            ref={replyRef}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                titleRef.current?.focus();
              }
            }}
            placeholder={`Reply to ${replyTo}…`}
            className="w-full resize-y rounded-control border border-slate-300 bg-white px-3 py-2 text-body text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-2 focus:outline-brand-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
          <div className="flex items-center justify-end gap-3">
            <span className="text-supporting text-slate-500 pointer-coarse:hidden dark:text-slate-400">
              {keyLabel('Mod-↵')} to send
            </span>
            <button
              type="submit"
              disabled={!draft.trim() || busy !== null}
              className={`${PRIMARY} ${target}`}
            >
              Send
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
