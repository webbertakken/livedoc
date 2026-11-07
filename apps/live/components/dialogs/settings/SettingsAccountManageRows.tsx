'use client';

// Settings > Account, signed in (docs/specs/014-identity/auth-and-guest-access.md "Account settings"): the
// account's name, its sign-in methods and its sessions. Each row only renders signed
// in (the catalogue's `available`), and reads the account through lib/account-manage.ts.
import { useEffect, useState } from 'react';
import { TextInput } from '@livedoc/ui';
import { authHrefWithReturn, useAuthReturnPath } from '@/components/chrome/auth-shared';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import {
  ACCOUNT_NAME_MAX,
  connectGoogle,
  readAccountSessions,
  readGoogleAccount,
  removeGoogle,
  saveAccountName,
  signOutOtherSessions,
  signOutSession,
  type AccountSessionRow,
} from '@/lib/account-manage';
import { useAuthConfig } from '@/lib/auth-config';
import { track } from '@/lib/telemetry';
import { SETTINGS_ROW_BUTTON, SettingsRowShell } from './SettingsRowShell';
import type {
  SettingsAccountNameRowSpec,
  SettingsSessionsRowSpec,
  SettingsSignInMethodsRowSpec,
  SettingsSignOutRowSpec,
} from './settings-catalogue';

export const NAME_SAVED = 'Saved.';
export const NAME_FAILED = "Couldn't save your name. Try again.";
export const LOAD_FAILED = "Couldn't load this. Try again.";
export const NOT_FRESH = 'For your safety, sign in again first.';
export const ACTION_FAILED = "That didn't work. Try again.";

const STATUS = 'mt-1 text-xs text-slate-600 dark:text-slate-300';
const LINK = 'font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400';

export function SettingsAccountNameRow({ row }: { row: SettingsAccountNameRowSpec }) {
  const { user, refreshSession } = useDeferredAuth();
  const saved = user?.name ?? '';
  const [name, setName] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const changed = name.trim() !== saved && name.trim().length > 0;

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const ok = await saveAccountName(name);
    if (ok) await refreshSession?.();
    setStatus(ok ? NAME_SAVED : NAME_FAILED);
    setBusy(false);
  };

  return (
    <SettingsRowShell
      row={row}
      control={
        <form
          className="flex shrink-0 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (changed && !busy) void save();
          }}
        >
          <TextInput
            aria-label="Your name"
            value={name}
            maxLength={ACCOUNT_NAME_MAX}
            onChange={(event) => {
              setName(event.target.value);
              // A refusal belongs to the name that was refused: editing clears it.
              setStatus(null);
            }}
            className="w-44"
          />
          <button type="submit" className={SETTINGS_ROW_BUTTON} disabled={!changed || busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      }
    >
      {status ? (
        <p role="status" className={STATUS}>
          {status}
        </p>
      ) : null}
    </SettingsRowShell>
  );
}

function SignInAgain() {
  const returnTo = useAuthReturnPath();
  return (
    <>
      {NOT_FRESH}{' '}
      <a href={authHrefWithReturn('/sign-in/', returnTo)} className={LINK}>
        Sign In Again
      </a>
    </>
  );
}

// The Google sign-in method as this account holds it: being read, unreadable, not linked, or linked under an id.
type GoogleMethod =
  | { state: 'loading' }
  | { state: 'unreadable' }
  | { state: 'none' }
  | { state: 'linked'; accountId: string };

async function readGoogleMethod(): Promise<GoogleMethod> {
  const read = await readGoogleAccount();
  if (read === null) return { state: 'unreadable' };
  return read === false ? { state: 'none' } : { state: 'linked', accountId: read };
}

export function SettingsSignInMethodsRow({ row }: { row: SettingsSignInMethodsRowSpec }) {
  const { user } = useDeferredAuth();
  const { methods } = useAuthConfig();
  const returnTo = useAuthReturnPath();
  const googleOffered = methods.includes('google');
  // Google may only go while the email code is a way back in (allowUnlinkingAll on the api).
  const emailOffered = methods.includes('email-code');
  const [google, setGoogle] = useState<GoogleMethod>({ state: 'loading' });
  const [status, setStatus] = useState<'not_fresh' | 'failed' | null>(null);

  useEffect(() => {
    if (!googleOffered) return;
    let current = true;
    void readGoogleMethod().then((read) => {
      if (current) setGoogle(read);
    });
    return () => {
      current = false;
    };
  }, [googleOffered]);
  const retry = async () => {
    setGoogle({ state: 'loading' });
    setGoogle(await readGoogleMethod());
  };

  const remove = async (accountId: string) => {
    setStatus(null);
    const outcome = await removeGoogle(accountId);
    if (outcome === 'done') setGoogle({ state: 'none' });
    else setStatus(outcome);
  };

  return (
    <SettingsRowShell row={row}>
      <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
        {emailOffered ? (
          <li className="flex items-center justify-between gap-3">
            <span>
              Email code <span className="text-slate-500 dark:text-slate-400">· {user?.email}</span>
            </span>
          </li>
        ) : null}
        {googleOffered ? (
          <li className="flex items-center justify-between gap-3">
            <span>
              Google
              {google.state === 'linked' ? (
                <span className="text-slate-500 dark:text-slate-400"> · Connected</span>
              ) : null}
            </span>
            {google.state === 'loading' ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">Loading…</span>
            ) : google.state === 'unreadable' ? (
              <button type="button" className={SETTINGS_ROW_BUTTON} onClick={() => void retry()}>
                Try Again
              </button>
            ) : google.state === 'linked' ? (
              emailOffered ? (
                <button
                  type="button"
                  className={SETTINGS_ROW_BUTTON}
                  onClick={() => void remove(google.accountId)}
                >
                  Remove
                </button>
              ) : null
            ) : (
              <button
                type="button"
                className={SETTINGS_ROW_BUTTON}
                onClick={() =>
                  void connectGoogle(returnTo).then((outcome) =>
                    setStatus(outcome === 'done' ? null : outcome),
                  )
                }
              >
                Connect Google
              </button>
            )}
          </li>
        ) : null}
      </ul>
      {google.state === 'unreadable' ? <p className={STATUS}>{LOAD_FAILED}</p> : null}
      {status ? (
        <p role="status" className={STATUS}>
          {status === 'not_fresh' ? <SignInAgain /> : ACTION_FAILED}
        </p>
      ) : null}
    </SettingsRowShell>
  );
}

export function SettingsSessionsRow({ row }: { row: SettingsSessionsRowSpec }) {
  const [sessions, setSessions] = useState<AccountSessionRow[] | null | 'loading'>('loading');
  const [failed, setFailed] = useState(false);
  // What is being signed out: one session's token, or 'others' for Sign Out Everywhere Else.
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void readAccountSessions().then((read) => {
      if (current) setSessions(read);
    });
    return () => {
      current = false;
    };
  }, []);
  const load = async () => {
    setSessions('loading');
    setSessions(await readAccountSessions());
  };
  // Read again after a sign-out, keeping the list on screen: a failed read keeps what is shown.
  const reread = async () => {
    const read = await readAccountSessions();
    if (read !== null) setSessions(read);
  };

  // A session signed out here leaves the list at once (every other one, for 'others'), while the list is read
  // again; its button is busy meanwhile, so it is never pressed twice.
  const act = async (target: string, work: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(target);
    setFailed(false);
    const ok = await work();
    setBusy(null);
    if (!ok) {
      setFailed(true);
      return;
    }
    setSessions((list) =>
      Array.isArray(list)
        ? list.filter((s) => (target === 'others' ? s.current : s.token !== target))
        : list,
    );
    await reread();
  };

  const others = Array.isArray(sessions) ? sessions.filter((s) => !s.current).length : 0;
  return (
    <SettingsRowShell
      row={row}
      control={
        others > 0 ? (
          <button
            type="button"
            className={SETTINGS_ROW_BUTTON}
            disabled={busy !== null}
            onClick={() => void act('others', signOutOtherSessions)}
          >
            {busy === 'others' ? 'Signing Out…' : 'Sign Out Everywhere Else'}
          </button>
        ) : undefined
      }
    >
      {sessions === 'loading' ? (
        <p className={STATUS}>Loading…</p>
      ) : sessions === null ? (
        <p className={STATUS}>
          {LOAD_FAILED}{' '}
          <button type="button" className={LINK} onClick={() => void load()}>
            Try Again
          </button>
        </p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-200">
          {sessions.map((session) => (
            <li key={session.token} className="flex items-center justify-between gap-3">
              <span>
                {session.label}
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {session.current
                    ? 'This browser'
                    : `Last active ${session.lastActive.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}`}
                </span>
              </span>
              {session.current ? null : (
                <button
                  type="button"
                  className={SETTINGS_ROW_BUTTON}
                  disabled={busy !== null}
                  onClick={() => void act(session.token, () => signOutSession(session.token))}
                  aria-label={`Sign out ${session.label}`}
                >
                  {busy === session.token ? 'Signing Out…' : 'Sign Out'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {failed ? (
        <p role="status" className={STATUS}>
          {ACTION_FAILED}
        </p>
      ) : null}
    </SettingsRowShell>
  );
}

// Sign Out, here as in the account menu: counted first, then the session ends and the page lands on the front door.
export function SettingsSignOutRow({ row }: { row: SettingsSignOutRowSpec }) {
  const { signOut } = useDeferredAuth();
  const [busy, setBusy] = useState(false);
  return (
    <SettingsRowShell
      row={row}
      control={
        <button
          type="button"
          className={SETTINGS_ROW_BUTTON}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            track('Session', 'SignedOut');
            void signOut({ redirectUrl: '/' });
          }}
        >
          {busy ? 'Signing Out…' : 'Sign Out'}
        </button>
      }
    />
  );
}
