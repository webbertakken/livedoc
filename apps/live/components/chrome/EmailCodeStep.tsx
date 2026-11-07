'use client';

// The code step of both auth pages, and of the re-verification before deleting the account
// (docs/specs/014-identity/auth-and-guest-access.md): "We sent a code
// to <email>", one six-digit field, "Sign in", and the two ways out, "Use a different email" and "Send a new code"
// (held for CODE_RESEND_COOLDOWN_S after each send, counting down silently and announced once it is available).

import { Button, TextInput } from '@livedoc/ui';
import { useEffect, useId, useState } from 'react';

// How long "Send a new code" waits after a send (D19). Safe range: 15 to 60 s.
export const CODE_RESEND_COOLDOWN_S = 30;
export const EMAIL_CODE_LENGTH = 6;

const LINK =
  'font-medium text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline dark:text-brand-400 dark:disabled:text-slate-500';

// Digits only, at most six: a pasted "123 456" or "Your code: 123456" still lands as the code.
export function codeOf(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

export function EmailCodeStep({
  email,
  sentAt,
  busy,
  submitLabel = 'Sign in',
  outboxHref,
  errorId,
  onSubmit,
  onResend,
  onBack,
  backLabel = 'Use a different email',
}: {
  email: string;
  // When the last code was sent (ms), which starts the resend cooldown. The page keys the step on it, so a new code
  // starts with an empty field and the cursor in it.
  sentAt: number;
  busy: boolean;
  submitLabel?: string;
  // Previews send no email: a link to where the code landed (docs/specs/014-identity/auth-and-guest-access.md
  // "Previews"); null on a host that sends real email.
  outboxHref: string | null;
  // The page's error, so the field is described by it (and focus can move there).
  errorId?: string;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onBack?: () => void;
  backLabel?: string;
}) {
  const fieldId = useId();
  const [code, setCode] = useState('');
  const remaining = useCooldown(sentAt);

  const complete = code.length === EMAIL_CODE_LENGTH;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete && !busy) onSubmit(code);
      }}
      className="space-y-4"
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">
        We sent a code to <strong className="text-slate-900 dark:text-slate-100">{email}</strong>.
        Use the newest code if you asked for more than one.
      </p>
      {outboxHref ? (
        <p className="text-sm">
          <a href={outboxHref} target="_blank" rel="noreferrer" className={LINK}>
            This preview sends no email: see the code
          </a>
        </p>
      ) : null}
      <div>
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          6-digit code
        </label>
        <TextInput
          id={fieldId}
          autoFocus
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={EMAIL_CODE_LENGTH + 4}
          value={code}
          aria-describedby={errorId}
          onChange={(e) => {
            const next = codeOf(e.target.value);
            setCode(next);
            // The sixth digit sends it: nobody needs to reach for the button.
            if (next.length === EMAIL_CODE_LENGTH && !busy) onSubmit(next);
          }}
          className="text-center text-xl font-semibold tracking-[0.4em]"
        />
      </div>
      <Button type="submit" size="md" disabled={busy || !complete} className="w-full shadow-sm">
        {busy ? 'Signing in…' : submitLabel}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {onBack ? (
          <button type="button" onClick={onBack} disabled={busy} className={LINK}>
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={onResend} disabled={busy || remaining > 0} className={LINK}>
          <span aria-live="off">
            {remaining > 0 ? `Send a new code (${remaining}s)` : 'Send a new code'}
          </span>
        </button>
      </div>
      <p role="status" className="sr-only">
        {remaining === 0 ? 'You can send a new code now.' : ''}
      </p>
    </form>
  );
}

// Whole seconds left of the resend cooldown at `now`.
export function secondsLeft(sentAt: number, now: number): number {
  return Math.max(0, Math.ceil((sentAt + CODE_RESEND_COOLDOWN_S * 1000 - now) / 1000));
}

// The cooldown, ticking once a second until it reaches 0.
function useCooldown(sentAt: number): number {
  const [remaining, setRemaining] = useState(() => secondsLeft(sentAt, Date.now()));
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = secondsLeft(sentAt, Date.now());
      setRemaining(next);
      if (next === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [sentAt]);
  return remaining;
}
