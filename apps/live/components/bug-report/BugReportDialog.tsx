'use client';

// The Report a Bug form (docs/specs/016-platform/bug-reports.md "The form"): what
// went wrong, more details, an opt-in screenshot, what is attached, then a confirmation or the reason it failed.
// Loaded on the first opening (BugReportProvider), so it adds nothing to a page until then.
import {
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { BUG_REPORT_LIMITS, type BugReportSubmission } from '@livedoc/api-schema';
import { Button, DialogCloseButton, DialogHeader, TextArea, TextInput } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { apiFetch, apiHeaders } from '@/lib/api/core';
import { browserBugReportInputs, collectBugReportContext } from '@/lib/bug-report/collect-context';
import { sendBugReport, type BugReportSendResult } from '@/lib/bug-report/send';
import { getGuestSelfId } from '@/lib/local-identity';
import { track } from '@/lib/telemetry';
import { BugReportAttached, type BugReportYou } from './BugReportAttached';
import { BugReportScreenshotField } from './BugReportScreenshotField';
import { BUG_REPORT_COPY as COPY } from './bug-report-copy';
import { useBugReportScreenshot } from './useBugReportScreenshot';

const TITLE_ID = 'bug-report-title';
// The counter shows once the title nears its limit.
const COUNTER_FROM = 160;

type Phase =
  | { kind: 'editing'; error: string | null }
  | { kind: 'sending' }
  | { kind: 'sent'; result: Extract<BugReportSendResult, { kind: 'filed' | 'stored' }> };

const FAILURE_COPY = {
  rate_limited: COPY.rateLimited,
  too_large: COPY.tooLarge,
  failed: COPY.failed,
} as const;

// The request's identity, as every api call carries it; a throw sends the report without one.
async function identity(): Promise<Record<string, string>> {
  return (await apiHeaders(getGuestSelfId() ?? '')) as Record<string, string>;
}

export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'editing', error: null });
  const shot = useBugReportScreenshot();
  const { isSignedIn } = useDeferredAuth();
  const doneRef = useRef<HTMLButtonElement>(null);
  const context = useMemo(() => collectBugReportContext(browserBugReportInputs()), []);
  const you: BugReportYou = isSignedIn ? 'account' : getGuestSelfId() ? 'guest' : 'none';

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (phase.kind === 'sending' || !title.trim()) return;
    setPhase({ kind: 'sending' });
    const prepared = await shot.settled();
    const submission: BugReportSubmission = {
      title: title.trim(),
      ...(details.trim() ? { details: details.trim() } : {}),
      context: collectBugReportContext(browserBugReportInputs()),
      ...(prepared ? { screenshot: prepared.screenshot } : {}),
    };
    const result = await sendBugReport(submission, { fetcher: apiFetch, identity });
    if (result.kind === 'failed') {
      setPhase({ kind: 'editing', error: FAILURE_COPY[result.reason] });
      return;
    }
    track('Feedback', 'Completed', 'Bug');
    setPhase({ kind: 'sent', result });
    requestAnimationFrame(() => doneRef.current?.focus());
  };

  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    shot.attachFile(file);
  };
  const onDrop = (e: DragEvent) => {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    shot.attachFile(file);
  };

  const sending = phase.kind === 'sending';
  return (
    <Dialog
      open
      onClose={onClose}
      titleId={TITLE_ID}
      size="lg"
      phoneSheet
      closeOnEscape={!sending}
      className="flex max-h-[90vh] flex-col"
    >
      <div data-bug-report-dialog="" className="flex min-h-0 flex-1 flex-col">
        <DialogHeader title={<span id={TITLE_ID}>{COPY.name}</span>}>
          <DialogCloseButton onClick={onClose} />
        </DialogHeader>
        {phase.kind === 'sent' ? (
          <>
            <div className="px-6 py-6" role="status">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {COPY.thanks}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {phase.result.kind === 'filed' ? COPY.filed(phase.result.number) : COPY.stored}
              </p>
            </div>
            <DialogFooter>
              <Button ref={doneRef} onClick={onClose}>
                {COPY.done}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => void send(e)}
            onPaste={onPaste}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {COPY.titleLabel}
                <TextInput
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={BUG_REPORT_LIMITS.title}
                  required
                  autoFocus
                  aria-describedby="bug-report-title-count"
                  className="font-normal"
                />
                <span
                  id="bug-report-title-count"
                  aria-live="polite"
                  className="self-end text-xs font-normal text-slate-500 dark:text-slate-400"
                >
                  {title.length >= COUNTER_FROM ? `${title.length}/${BUG_REPORT_LIMITS.title}` : ''}
                </span>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span>
                  {COPY.detailsLabel}{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {COPY.optional}
                  </span>
                </span>
                <TextArea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={BUG_REPORT_LIMITS.details}
                  rows={3}
                  className="max-h-72 min-h-[4.5rem] font-normal [field-sizing:content]"
                />
              </label>
              <BugReportScreenshotField shot={shot} />
              <BugReportAttached context={context} you={you} screenshot={Boolean(shot.prepared)} />
            </div>
            <DialogFooter>
              {phase.kind === 'editing' && phase.error ? (
                <p role="alert" className="mr-auto text-sm text-rose-700 dark:text-rose-300">
                  {phase.error}
                </p>
              ) : null}
              <Button type="submit" aria-disabled={sending || !title.trim()}>
                {sending ? COPY.sending : COPY.send}
              </Button>
            </DialogFooter>
          </form>
        )}
      </div>
    </Dialog>
  );
}
