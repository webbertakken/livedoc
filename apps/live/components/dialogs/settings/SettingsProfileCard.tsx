'use client';

import type { ReactNode } from 'react';
import {
  ButtonContent,
  buttonClassName,
  IDENTITY_FILL,
  identityVars,
  PictureDisc,
} from '@livedoc/ui';
import { useAuthHrefs } from '@/components/chrome/auth-shared';
import { useDeferredAuth } from '@/components/providers/deferred-auth';
import { accountInitial } from '@/lib/account-avatar';
import { useSignInAvailable } from '@/lib/auth-config';
import { initialsOf } from '@/lib/identity';
import { presenceColourName } from '@/lib/self-presence';
import { ProfileBanner } from './ProfileBanner';
import { useInSettingsGroup, SETTINGS_CARD } from './SettingsGroup';
import type { SettingsIdentityRowSpec } from './settings-catalogue';
import { useSelfPresence } from './useSelfPresence';
import { AUTOMATIC } from './SettingsPresenceColourRow';

// The profile card, the `identity` row that opens Settings > Account
// (docs/specs/014-identity/profile-and-email-notifications.md "Identity";
// docs/specs/014-identity/auth-and-guest-access.md
// "Presentation and UX"): who this is, as collaborators see them. Signed in, the account: picture or initials, name,
// email, the account chip, when it joined and its colour; Name and Colour are edited in the rows below. A guest gets
// the same card as a guest, and what signing in brings.

// The avatar's diameter.
const AVATAR_PX = 72;
const NEUTRAL_SWATCH = 'bg-slate-300 dark:bg-slate-600';

export const GUEST_INVITATION_HEADING = 'Sign in to make this yours';
export const GUEST_INVITATION_LINES = [
  'Keep your documents and settings on every device.',
  'Choose the name and colour collaborators see on your cursor.',
  'Share with your team, and get an email when someone comments.',
] as const;

function joinedText(joined: Date | null | undefined): string | null {
  if (!joined || Number.isNaN(joined.getTime())) return null;
  return joined.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function SettingsProfileCard({ row }: { row: SettingsIdentityRowSpec }) {
  const { authLoaded, isSignedIn, user } = useDeferredAuth();
  const presence = useSelfPresence();
  const inGroup = useInSettingsGroup();
  const signedIn = Boolean(authLoaded && isSignedIn && user);
  const self = presence.state === 'ready' ? presence.self : null;
  const colour = self?.color ?? null;
  const name = signedIn ? (user?.name ?? user?.email ?? 'Your account') : (self?.name ?? row.label);
  const joined = signedIn ? joinedText(user?.createdAt) : null;

  const card = (
    <div data-settings-cell={row.key} data-profile-card="" className="rounded-[inherit]">
      <ProfileBanner name={name} colour={colour} />
      <div className="relative px-5 pb-5">
        <div className="-mt-9 flex flex-wrap items-end gap-x-4 gap-y-3">
          <span className="rounded-full ring-4 ring-white dark:ring-slate-800">
            <PictureDisc
              pictureUrl={signedIn ? user?.pictureUrl : null}
              size={AVATAR_PX}
              aria-hidden
              style={colour ? identityVars(colour) : undefined}
              className={`text-2xl font-semibold text-white shadow-md ${
                colour ? IDENTITY_FILL : 'bg-slate-400 dark:bg-slate-600'
              }`}
            >
              {signedIn ? accountInitial(user) : self ? initialsOf(self.name) : 'G'}
            </PictureDisc>
          </span>
          <div className="min-w-0 flex-1 pb-0.5">
            <h3
              id={`${row.key}-label`}
              className="truncate text-lg font-semibold leading-tight text-slate-900 dark:text-white"
            >
              {name}
            </h3>
            <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
              {signedIn ? user?.email : 'Not signed in'}
            </p>
          </div>
        </div>
        <ul aria-label="About this account" className="mt-4 flex flex-wrap gap-2">
          {signedIn ? (
            <Chip tone="brand">
              <AccountGlyph />
              LiveDoc Account
            </Chip>
          ) : (
            <Chip tone="muted">Guest · This Browser Only</Chip>
          )}
          {joined ? <Chip tone="muted">Joined {joined}</Chip> : null}
          <Chip tone="muted">
            <span
              aria-hidden="true"
              data-profile-swatch=""
              style={colour ? identityVars(colour) : undefined}
              className={`size-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/20 ${
                colour ? IDENTITY_FILL : NEUTRAL_SWATCH
              }`}
            />
            Colour:{' '}
            {colour ? presenceColourName(colour) : presence.state === 'none' ? AUTOMATIC : '…'}
          </Chip>
        </ul>
        {signedIn ? null : <GuestInvitation />}
      </div>
    </div>
  );
  return inGroup ? card : <div className={SETTINGS_CARD}>{card}</div>;
}

function Chip({ tone, children }: { tone: 'brand' | 'muted'; children: ReactNode }) {
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === 'brand'
          ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/30'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200'
      }`}
    >
      {children}
    </li>
  );
}

function AccountGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
    >
      <path
        d="M8 1.75 13.25 4v4c0 3-2.25 5.25-5.25 6.25C5 13.25 2.75 11 2.75 8V4z"
        strokeWidth={1.4}
      />
      <path
        d="m5.75 8 1.6 1.6 2.9-3.1"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// What signing in adds, and the way in, returning to Settings. Absent where the deployment has no sign-in.
function GuestInvitation() {
  const { signInHref, signUpHref } = useAuthHrefs();
  const signInAvailable = useSignInAvailable();
  if (!signInAvailable) return null;
  return (
    <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-400/25 dark:bg-brand-500/10">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">
        {GUEST_INVITATION_HEADING}
      </p>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        {GUEST_INVITATION_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={signInHref} className={buttonClassName({ variant: 'primary', size: 'sm' })}>
          <ButtonContent>Sign In</ButtonContent>
        </a>
        <a href={signUpHref} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
          <ButtonContent>Create Account</ButtonContent>
        </a>
      </div>
    </div>
  );
}
