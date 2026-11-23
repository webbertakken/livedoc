'use client';

// Account-deletion confirmation modal (docs/specs/014-identity/auth-and-guest-access.md "Deleting an account").
// The person types their email to confirm: a typo-resistant gate that's harder to miss-click than a single "Are you
// sure?" button. Then one request (`DELETE /api/account`) removes the data first and the identity after it, and
// signs the browser out.
//
// A session verified more than ten minutes ago is refused until the person verifies again: a code to the account's
// email, typed here, signs this browser in afresh, and the deletion runs once more. Cancelled or failed, nothing was
// deleted, and the dialog says so.

import { Button, useEscape, useFocusTrap, Portal } from '@livedoc/ui';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/telemetry';
import { useModalGuard } from '@/hooks/ui/useModalGuard';
import { EmailCodeStep } from '@/components/chrome/EmailCodeStep';
import { reverifyWithCode, sendReverifyCode } from '@/lib/reverify';
import { DialogFooter } from '@/components/dialogs/DialogFooter';

// `verify`: the api asked for a fresh verification; a code went to the account's email.
type Phase = 'idle' | 'submitting' | 'verify' | 'error';

export function DeleteAccountDialog({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onDeleted: () => Promise<void> | void;
}) {
  // Silence the canvas shortcut/paste listeners behind the modal
  // (see lib/modal-guard).
  useModalGuard(open);
  const { user, deleteAccount } = useDeferredAuth();
  const expectedEmail = user?.email ?? '';

  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [codeSentAt, setCodeSentAt] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Reset state every time the dialog opens (adjusted during render). Without this, a user
  // who cancels mid-flow and re-opens it sees a stale typed value
  // and possibly a stale error.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped('');
      setPhase('idle');
      setErrorMsg('');
      setVerifying(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    // Focus the input on next tick so the modal mount completes
    // first — focusing during render is silently dropped.
    const handle = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(handle);
  }, [open]);

  // Escape closes, same convention as other modals (ShareDialog).
  // Disabled mid-submit so the user can't cancel a request that's
  // already in flight.
  useEscape(onClose, { enabled: open && phase !== 'submitting' && !verifying });

  if (!open) return null;

  const emailsMatch =
    expectedEmail.length > 0 && typed.trim().toLowerCase() === expectedEmail.toLowerCase();

  const runDelete = async () => {
    if (!deleteAccount) return;
    setPhase('submitting');
    setErrorMsg('');
    const outcome = await deleteAccount();
    if (outcome === 'deleted') {
      // Anonymous, no identifier: the account-lifecycle counter for the dashboard's Account Activity stack
      // (docs/specs/017-telemetry/telemetry.md). Fired before the sign-out, so it still reaches the wire.
      track('Session', 'Deleted', 'Account');
      await onDeleted();
      return;
    }
    if (outcome === 'not-fresh') {
      const failed = await sendReverifyCode(expectedEmail);
      if (failed) {
        setPhase('error');
        setErrorMsg(`${failed} Nothing was deleted.`);
        return;
      }
      setCodeSentAt(Date.now());
      setPhase('verify');
      return;
    }
    setPhase('error');
    setErrorMsg("We couldn't delete your account. Try again.");
  };

  const handleDelete = () => {
    if (!emailsMatch || phase === 'submitting' || !user || !deleteAccount) return;
    void runDelete();
  };

  const handleCode = async (otp: string) => {
    setVerifying(true);
    setErrorMsg('');
    const failed = await reverifyWithCode(expectedEmail, otp);
    setVerifying(false);
    if (failed) {
      setErrorMsg(`${failed} Nothing was deleted.`);
      return;
    }
    await runDelete();
  };

  const resendCode = async () => {
    setErrorMsg('');
    const failed = await sendReverifyCode(expectedEmail);
    if (failed) setErrorMsg(failed);
    else setCodeSentAt(Date.now());
  };

  return (
    <Portal>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="pointer-events-none fixed inset-0 z-[var(--z-modal)] flex items-center justify-center"
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          className="pointer-events-auto flex w-[28rem] max-w-[92%] animate-fly-up-in flex-col rounded-surface border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 outline-none dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          <div className="border-b border-slate-100 px-6 pt-6 pb-4 dark:border-slate-800">
            <h2
              id="delete-account-title"
              className="text-dialog-title text-slate-900 dark:text-slate-100"
            >
              Delete Account
            </h2>
            <p className="mt-1 text-body text-slate-600 dark:text-slate-400">
              This permanently removes your documents (including any in the Trash), folders, and
              participant record from the server, then deletes your account and signs you out. This
              cannot be undone.
            </p>
          </div>

          {phase === 'verify' ? (
            <div className="px-6 py-5">
              <p className="mb-3 text-body text-slate-700 dark:text-slate-300">
                You signed in a while ago, so confirm it's you before anything is deleted.
              </p>
              <EmailCodeStep
                key={codeSentAt}
                email={expectedEmail}
                sentAt={codeSentAt}
                busy={verifying}
                submitLabel="Verify and delete"
                outboxHref={null}
                errorId={errorMsg ? 'delete-account-error' : undefined}
                onSubmit={(otp) => void handleCode(otp)}
                onResend={() => void resendCode()}
              />
              {errorMsg ? (
                <div
                  id="delete-account-error"
                  role="alert"
                  className="mt-3 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-body text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                >
                  {errorMsg}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="px-6 py-5">
              <label
                htmlFor="delete-confirm-email"
                className="block text-body text-slate-700 dark:text-slate-300"
              >
                Type{' '}
                <strong className="font-medium text-slate-900 dark:text-slate-100">
                  {expectedEmail || 'your email address'}
                </strong>{' '}
                to confirm
              </label>
              <input
                ref={inputRef}
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={phase === 'submitting'}
                className="mt-2 h-field w-full rounded-control border border-slate-200 bg-white px-3 text-body text-slate-900 placeholder-slate-400 transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-rose-500/20"
                placeholder="you@example.com"
              />

              {phase === 'error' && errorMsg ? (
                <div className="mt-3 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-body text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {errorMsg}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={phase === 'submitting' || verifying}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleDelete}
              disabled={!emailsMatch || phase === 'submitting' || phase === 'verify'}
              className="shadow-sm"
            >
              {phase === 'submitting' ? 'Deleting…' : 'Delete Account'}
            </Button>
          </DialogFooter>
        </div>
      </div>
    </Portal>
  );
}
