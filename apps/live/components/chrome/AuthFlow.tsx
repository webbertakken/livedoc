'use client';

// Both auth pages (docs/specs/014-identity/auth-and-guest-access.md "Auth surface"): `/sign-in` and
// `/get-started` are one flow with two openings. Google first when the host offers it, then an
// email code: the email (and on `/get-started` a name above it), "Send code", the code step, and, for an account that
// has no name yet, "What should we call you?" once. An email that has no account is not turned away on `/sign-in`:
// the code creates it.
//
// On success the browser goes to the destination with a full page load in place of this page, so every page starts
// from a fresh session read and Back skips the sign-in page; other tabs are nudged to read theirs. Google's round trip
// ends at better-auth's own callback, which redirects to the same destination (or back here with `?error=`).

import { announceAccountChange, writeSignedInHint } from '@livedoc/account-session';
import { Button, TextInput } from '@livedoc/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { useAppNavigation } from '@/hooks/navigation/useAppNavigation';
import { authClient } from '@/lib/auth-client';
import { useAuthConfig } from '@/lib/auth-config';
import { authErrorCopy, googleReturnError } from '@/lib/auth-errors';
import {
  AuthCard,
  AuthDisabledNotice,
  AuthEmailField,
  GoogleAuthButton,
  OrDivider,
  POST_AUTH_DEFAULT,
  POST_AUTH_SIGNIN_DEFAULT,
  RedirectingCard,
  authHrefWithReturn,
  guestReturnHref,
  resolvePostAuthDestination,
} from './auth-shared';
import { EmailCodeStep } from './EmailCodeStep';

export type AuthFlowKind = 'sign-in' | 'sign-up';

type Step = 'email' | 'code' | 'name' | 'leaving';

const PAGE: Record<AuthFlowKind, '/sign-in/' | '/get-started/'> = {
  'sign-in': '/sign-in/',
  'sign-up': '/get-started/',
};

const CROSS_LINK = 'font-medium text-brand-700 hover:underline dark:text-brand-400';

// Where codes land on a host that sends no email (previews): the newest message to that address.
export function outboxHref(email: string): string {
  return `/api/preview/outbox?to=${encodeURIComponent(email)}`;
}

export function AuthFlow({ kind }: { kind: AuthFlowKind }) {
  const searchParams = useSearchParams();
  const router = useAppNavigation();
  const config = useAuthConfig();
  const auth = useDeferredAuth();
  const errorId = useId();
  const nameId = useId();

  const redirect = searchParams.get('redirect_url');
  const destination = resolvePostAuthDestination(
    searchParams,
    kind === 'sign-in' ? POST_AUTH_SIGNIN_DEFAULT : POST_AUTH_DEFAULT,
  );
  // A first sign-in is a sign-up, whichever page it started on: the welcome flow, unless a destination was asked.
  const newAccountDestination = resolvePostAuthDestination(searchParams, POST_AUTH_DEFAULT);

  const [step, setStep] = useState<Step>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [error, setError] = useState(() => googleReturnError(searchParams.get('error')) ?? '');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);

  // Already signed in when the page opened: go on, never show a form.
  const alreadySignedIn = auth.authLoaded && auth.isSignedIn && step === 'email';
  useEffect(() => {
    if (alreadySignedIn) router.replace(destination);
  }, [alreadySignedIn, router, destination]);

  // An error moves focus to itself, so a screen reader hears it and the keyboard starts there.
  useEffect(() => {
    if (error) document.getElementById(errorId)?.focus();
  }, [error, errorId]);

  if (config.signIn === 'off') return <AuthDisabledNotice />;
  if (alreadySignedIn || step === 'leaving') return <RedirectingCard />;

  const methods = config.methods;
  // Until the capabilities answer, the email form shows (the common case) and Google's place is held.
  const offersGoogle = methods.includes('google');
  const offersEmail = config.signIn === 'unknown' || methods.includes('email-code');

  const leave = (to: string) => {
    writeSignedInHint(true);
    announceAccountChange(true);
    setStep('leaving');
    // In place of this page: Back from where it lands never returns to a sign-in page that would only send the
    // person on again.
    window.location.replace(to);
  };

  const sendCode = async () => {
    setError('');
    setBusy(true);
    try {
      const { error: failed } = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: 'sign-in',
      });
      if (failed) {
        setError(authErrorCopy(failed));
        return;
      }
      setSentAt(Date.now());
      setStep('code');
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (otp: string) => {
    setError('');
    setBusy(true);
    try {
      const typedName = kind === 'sign-up' ? name.trim() : '';
      const { data, error: failed } = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp,
        ...(typedName ? { name: typedName } : {}),
      });
      if (failed || !data) {
        setError(authErrorCopy(failed));
        return;
      }
      if (!data.user.name?.trim()) {
        setStep('name');
        return;
      }
      leave(kind === 'sign-up' ? newAccountDestination : destination);
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    setError('');
    setBusy(true);
    try {
      const { error: failed } = await authClient.updateUser({ name: name.trim() });
      if (failed) {
        setError(authErrorCopy(failed));
        return;
      }
      leave(newAccountDestination);
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    setError('');
    setGoogleBusy(true);
    // The round trip lands on a page that decides before the session read answers (where `/new` saves): say
    // "probably signed in" now, the safe direction if it fails (docs/specs/014-identity/auth-and-guest-access.md
    // "Who is a guest, before the session answers").
    writeSignedInHint(true);
    try {
      const { error: failed } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: destination,
        newUserCallbackURL: newAccountDestination,
        errorCallbackURL: authHrefWithReturn(PAGE[kind], redirect),
      });
      if (failed) {
        writeSignedInHint(false);
        setError(authErrorCopy(failed));
        setGoogleBusy(false);
      }
    } catch (err) {
      writeSignedInHint(false);
      setError(authErrorCopy(err));
      setGoogleBusy(false);
    }
  };

  const title =
    step === 'code'
      ? 'Check your email'
      : step === 'name'
        ? 'What should we call you?'
        : kind === 'sign-in'
          ? 'Welcome back'
          : 'Create your account';
  const subtitle =
    step !== 'email'
      ? undefined
      : kind === 'sign-in'
        ? 'Sign in to keep your documents with you on every device.'
        : 'Free, and everything you made as a guest comes with you.';

  return (
    <AuthCard
      title={title}
      subtitle={subtitle}
      guestHref={guestReturnHref(searchParams)}
      error={error}
      errorId={errorId}
      footer={
        step === 'email' ? (
          kind === 'sign-in' ? (
            <>
              New to LiveDoc?{' '}
              <Link href={authHrefWithReturn('/get-started/', redirect)} className={CROSS_LINK}>
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href={authHrefWithReturn('/sign-in/', redirect)} className={CROSS_LINK}>
                Sign in
              </Link>
            </>
          )
        ) : undefined
      }
    >
      {step === 'code' ? (
        <EmailCodeStep
          key={sentAt}
          email={email.trim()}
          sentAt={sentAt}
          busy={busy}
          outboxHref={config.emailOutbox ? outboxHref(email.trim()) : null}
          errorId={error ? errorId : undefined}
          onSubmit={(otp) => void verify(otp)}
          onResend={() => void sendCode()}
          onBack={() => {
            setError('');
            setStep('email');
          }}
        />
      ) : step === 'name' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !busy) void saveName();
          }}
          className="space-y-4"
        >
          <NameField id={nameId} value={name} onChange={setName} autoFocus />
          <Button
            type="submit"
            size="md"
            disabled={busy || !name.trim()}
            className="w-full shadow-sm"
          >
            {busy ? 'Saving…' : 'Continue'}
          </Button>
          <button
            type="button"
            onClick={() => leave(newAccountDestination)}
            disabled={busy}
            className={`w-full text-center text-sm ${CROSS_LINK}`}
          >
            Not now
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim() && !busy) void sendCode();
          }}
          className="space-y-4"
        >
          {/* Google's place is held until the methods are known, so a late answer never shifts the form. */}
          {config.signIn === 'unknown' ? (
            <div aria-hidden className="min-h-[5.25rem]" />
          ) : offersGoogle ? (
            <>
              <GoogleAuthButton
                label="Continue with Google"
                loading={googleBusy}
                disabled={googleBusy}
                onClick={() => void continueWithGoogle()}
              />
              {offersEmail ? <OrDivider /> : null}
            </>
          ) : null}
          {offersEmail ? (
            <>
              {kind === 'sign-up' ? (
                <NameField id={nameId} value={name} onChange={setName} />
              ) : null}
              <AuthEmailField value={email} onChange={setEmail} />
              <Button
                type="submit"
                size="md"
                disabled={busy || !email.trim()}
                className="w-full shadow-sm"
              >
                {busy ? 'Sending…' : 'Send code'}
              </Button>
            </>
          ) : null}
        </form>
      )}
    </AuthCard>
  );
}

function NameField({
  id,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        Your name
      </label>
      <TextInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="name"
        autoFocus={autoFocus}
        maxLength={100}
      />
    </div>
  );
}
