'use client';

// Pieces shared between the sign-in (`/sign-in/`) and sign-up (`/get-started/`) pages and every surface that sends
// someone there: the card on the Night Band frame, the interstitial, the guest-only notice, the email field, the
// Google button and divider, and the `redirect_url` guards. Both pages run one flow (AuthFlow.tsx); the code step is
// EmailCodeStep.tsx.
//
// Lives in `components/` (not `packages/`) because the styling is app-specific; no other workspace consumes it.

import { buttonClassName, TextInput, ButtonContent } from '@livedoc/ui';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { sameOriginPath } from '@/lib/same-origin-path';
import { AUTH_TITLE, AuthStage } from './AuthStage';
import { AccountPitch } from './auth-pitches';

// ---------------------------------------------------------------------
// Outer card layout
// ---------------------------------------------------------------------

// The card both auth pages render inside, on the Night Band frame
// (docs/specs/014-identity/auth-and-guest-access.md "The look: Night
// Band"): the page's title, an optional line under it, an optional
// inline error or notice, and an optional footer link slot, beside the
// account pitch. Keeps the two pages from drifting in spacing / colour /
// shadow tokens. `pitch={false}` drops the pitch for the interstitials
// and the guest-only notice, where "what an account adds" would mislead.
export function AuthCard({
  title,
  subtitle,
  error,
  notice,
  children,
  footer,
  guestHref,
  pitch = true,
  errorId,
}: {
  title: string;
  subtitle?: string;
  error: string;
  // The error's id, so a field can be described by it and focus can move to it.
  errorId?: string;
  // Good news (a code was resent): a status, never the error box; an error wins over it.
  notice?: string;
  children: ReactNode;
  footer?: ReactNode;
  // The header's "keep going as a guest" link (guestReturnHref); none hides it.
  guestHref?: string | null;
  pitch?: boolean;
}) {
  return (
    <AuthStage aside={pitch ? <AccountPitch /> : undefined} guestHref={guestHref}>
      <div className="mb-6">
        <h1 className={AUTH_TITLE}>{title}</h1>
        {subtitle ? (
          <p className="mt-2 text-body text-slate-600 dark:text-slate-400">{subtitle}</p>
        ) : null}
      </div>

      {error ? (
        <div
          id={errorId}
          role="alert"
          tabIndex={-1}
          className="mb-4 rounded-menu border border-rose-200 bg-rose-50 px-3 py-2 text-body text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {error}
        </div>
      ) : notice ? (
        <div
          role="status"
          className="mb-4 rounded-menu border border-emerald-200 bg-emerald-50 px-3 py-2 text-body text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
        >
          {notice}
        </div>
      ) : null}

      {children}

      {footer ? (
        <p className="mt-6 text-center text-body text-slate-600 dark:text-slate-400">{footer}</p>
      ) : null}
    </AuthStage>
  );
}

// ---------------------------------------------------------------------
// Interstitial — shown while an already-signed-in visitor is sent on,
// and as the Suspense fallback for both pages. Same frame, no
// pitch, so a hand-off never flashes a different ground.
// ---------------------------------------------------------------------

export function RedirectingCard() {
  return (
    <AuthStage>
      <p className="text-center text-body text-slate-600 dark:text-slate-400">Redirecting…</p>
    </AuthStage>
  );
}

// ---------------------------------------------------------------------
// Notice shown on the auth routes on a host without sign-in (docs/specs/014-identity/auth-and-guest-access.md
// "Deployment modes": a self-host with no keys). The editor still works, so the one action is to carry on as a guest.
// ---------------------------------------------------------------------

export function AuthDisabledNotice() {
  return (
    <AuthCard title="Sign-in is off here" error="" pitch={false}>
      <p className="text-body text-slate-600 dark:text-slate-400">
        Sign-in isn't turned on for this site. Everything works without an account.
      </p>
      <div className="mt-6 flex justify-center">
        <a
          href={POST_AUTH_DEFAULT}
          className={buttonClassName({ size: 'md', className: 'shadow-sm' })}
        >
          <ButtonContent>Continue as guest</ButtonContent>
        </a>
      </div>
    </AuthCard>
  );
}

// ---------------------------------------------------------------------
// Google brand SVG. Same colours as the official "Sign in with Google"
// guidelines (4285F4 / 34A853 / FBBC05 / EA4335). Used by both pages'
// OAuth button.
// ---------------------------------------------------------------------

function GoogleGlyph() {
  return (
    <svg className="size-icon-title" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Google OAuth button + "or" divider — the block both auth pages render
// above their email form. Was duplicated in sign-in and get-started,
// and both copies were light-only: on the dark card the slate-700 label
// read as a disabled button and the divider's bg-white chip floated as
// a light box.
// ---------------------------------------------------------------------

// The email input both pages open with. Identical down to the placeholder and
// the autocomplete hint, and the `id`/`htmlFor` pairing is the reason it is
// worth a component rather than two copies: a label that stops matching its
// input is invisible until somebody uses a screen reader.
//
// The last piece of these two pages that had not been lifted here. The 6-digit
// code input, the Google glyph, the interstitial and the error parser all were;
// this one stayed behind because it is short, which is exactly how a
// divergence gets in.
export function AuthEmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor="email" className="mb-1 block text-body text-slate-700 dark:text-slate-300">
        Email
      </label>
      <TextInput
        id="email"
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
      />
    </div>
  );
}

export function GoogleAuthButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-menu border border-slate-300 bg-white px-4 py-2.5 text-body text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-white/5 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-white/10"
    >
      {loading ? (
        <span className="text-slate-500 dark:text-slate-400">Redirecting…</span>
      ) : (
        <>
          <GoogleGlyph />
          {label}
        </>
      )}
    </button>
  );
}

export function OrDivider() {
  // Two rules either side of the word rather than a chip over one rule: the card is
  // translucent now, so a filled chip would show as a box.
  return (
    <div className="flex items-center gap-3 text-supporting text-slate-500 dark:text-slate-400">
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      or
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

// ---------------------------------------------------------------------
// Post-auth destination resolution
//
// Both sign-in and sign-up accept a protected page's bounce as
// `?redirect_url=/<path>`. After verification the user should land back
// where they came from. Routes are now clean (no `/live` prefix — the
// router selects the live app by route, docs/specs/016-platform/router-app.md), so destinations are
// plain same-origin paths. Validation rules:
//
//   - Must be a same-origin absolute PATH: starts with a single `/`,
//     NOT `//` or `/\` — those are protocol-relative / backslash
//     open-redirect tricks that browsers resolve to a foreign origin.
//   - Must NOT start with `/sign-in` or `/get-started` (loop guard:
//     bouncing back to the auth page after sign-in would cycle).
//   - Anything missing, unsafe, or pointing back at auth falls through
//     to the supplied default.
// ---------------------------------------------------------------------

// Sign-up / generic default: the welcome + create-new flow (`/new` used
// to be where bare `/live` redirected). NOT `/` — that's the marketing
// home now, not the app.
export const POST_AUTH_DEFAULT = '/new';

// Sign-in default: a returning user with no `?redirect_url` lands on
// their Explorer ("here's all your stuff") rather than the new-document
// welcome flow that suits a fresh sign-up. See docs/specs/014-identity/auth-and-guest-access.md.
export const POST_AUTH_SIGNIN_DEFAULT = '/explorer';

// A redirect_url is safe iff it's a same-origin absolute path that isn't an
// auth page. sameOriginPath is the open-redirect guard: it also refuses the
// `\` and control-character tricks browsers normalise into `//host`.
function isSafeInternalPath(p: string | null | undefined): p is string {
  const safe = sameOriginPath(p);
  return (
    safe !== null &&
    safe === p &&
    !safe.toLowerCase().startsWith('/sign-in') &&
    !safe.toLowerCase().startsWith('/get-started')
  );
}

export function resolvePostAuthDestination(
  searchParams: { get: (key: string) => string | null },
  defaultDest: string = POST_AUTH_DEFAULT,
): string {
  const redirect = searchParams.get('redirect_url');
  return isSafeInternalPath(redirect) ? redirect : defaultDest;
}

// Where the header's "Not now, keep going as a guest" link goes
// (docs/specs/014-identity/auth-and-guest-access.md "The look: Night Band"):
// back to the page the visitor came from when that is safe and works
// without an account, else the new-document flow. The connect pages
// (/oauth/*, /workbench/*) only work signed in, so returning a guest
// there would just bounce them straight back here.
const SIGNED_IN_ONLY = /^\/(oauth|workbench)(\/|\?|#|$)/i;
export function guestReturnHref(searchParams: { get: (key: string) => string | null }): string {
  const redirect = searchParams.get('redirect_url');
  return isSafeInternalPath(redirect) && !SIGNED_IN_ONLY.test(redirect)
    ? redirect
    : POST_AUTH_DEFAULT;
}

// ---------------------------------------------------------------------
// Building auth hrefs (the OTHER half of the round-trip)
//
// The resolvers above CONSUME `?redirect_url` on the auth pages. These
// build it, so every "Sign in" / "Create account" trigger sends the user
// back where they started after auth. Same param name, same safety rules
// (via isSafeInternalPath) — an unsafe or auth-page `returnTo` is simply
// dropped, so the auth page falls back to its own default and we never
// seed a redirect loop or an open redirect.
// ---------------------------------------------------------------------

// Compose an auth-route href carrying a return path as `?redirect_url`.
export function authHrefWithReturn(
  authPath: '/sign-in/' | '/get-started/',
  returnTo: string | null | undefined,
): string {
  return isSafeInternalPath(returnTo)
    ? `${authPath}?redirect_url=${encodeURIComponent(returnTo)}`
    : authPath;
}

// The visitor's current same-origin location (path + query + hash), for
// use as the auth return path. Recomputes on client navigation
// (usePathname) and on hash changes, so a Sign in click always carries
// the live location — including a document's `?query` and `#t=<tab>` hash
// so you land back on the exact tab. SSR / first paint has no `window`,
// so it starts at the bare pathname and upgrades on mount, well before
// any click.
export function useAuthReturnPath(): string {
  const pathname = usePathname();
  const [returnTo, setReturnTo] = useState(pathname);
  useEffect(() => {
    const read = () =>
      setReturnTo(window.location.pathname + window.location.search + window.location.hash);
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [pathname]);
  return returnTo;
}

// Both auth hrefs wired to the current location, for the sign-in /
// create-account triggers. Cheap — destructure just the one you need.
export function useAuthHrefs(): { signInHref: string; signUpHref: string } {
  const returnTo = useAuthReturnPath();
  return {
    signInHref: authHrefWithReturn('/sign-in/', returnTo),
    signUpHref: authHrefWithReturn('/get-started/', returnTo),
  };
}
