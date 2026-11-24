'use client';

// Header sign-in / sign-out pill. Shows:
//
//   - signed out → "Sign in" link to /live/sign-in/
//   - signed in  → account avatar (profile picture or initial) + dropdown with "Account", "Report a Bug" + "Sign out"
//
// Mounted in EditorHeader (and any future header chrome that wants auth controls). Reads the session from the
// auth bridge's context (components/providers/AuthBridge.tsx), so it works anywhere under it.
//
// While the session is still being read we render nothing, so the header doesn't flicker a "Sign in" link only to
// swap it for the account pill a tick later. On a host without sign-in (a self-host with no keys,
// docs/specs/002-project-scope/open-source-and-business-model.md) it renders nothing at all.

import { useDeferredAuth } from '@/components/providers/deferred-auth';
import Link from 'next/link';
import { Fragment, useId, useRef, type ReactNode } from 'react';
import {
  useClickOutside,
  SOLID_BRAND_DARK,
  Glyph,
  useMenu,
  useMenuButton,
  PictureDisc,
} from '@livedoc/ui';
import { useSignInAvailable } from '@/lib/auth-config';
import { track } from '@/lib/telemetry';
import { useAuthHrefs } from '@/components/chrome/auth-shared';
import { useOpenBugReport } from '@/components/bug-report/BugReportProvider';
import { accountInitial } from '@/lib/account-avatar';
import {
  HEADER_ACTION_BTN,
  HEADER_ACTION_TONE,
  HEADER_ICON_SLOT_PX,
  HeaderGlyph,
} from '@/components/chrome/header-action';
import { useInToolbarGroup } from '@/components/chrome/ToolbarGroup';
import { TOOLBAR_BUTTON } from '@/components/chrome/toolbar-surface';

// The account picture's disc in the editor's actions group: 20px, the group's icon size beside a 13px name.
const GROUP_DISC_PX = 20;

// Account self-deletion now lives on the Explorer profile page (docs/specs/014-identity/profile-and-email-notifications.md),
// reachable from the "Profile" item below, so the destructive action has one
// home rather than hanging off this dropdown too.

type AuthControlsProps = {
  // Opens this page's Settings dialog on its Account category. Both hosts
  // (the editor and the Explorer) own a Settings dialog, so the Account item
  // opens it in place rather than navigating away. Without one, the item
  // falls back to the Explorer's `?settings=account` deep link.
  onOpenAccount?: () => void;
};

function AuthControlsEnabled({ onOpenAccount }: AuthControlsProps) {
  const { authLoaded, isSignedIn, user, signOut } = useDeferredAuth();
  // A menu button (docs/specs/004-interface-design/menus.md): the menu keyboard comes from the hooks.
  const {
    open: menuOpen,
    close: closeMenu,
    toggle,
    trigger,
    setTrigger,
    onTriggerKeyDown,
  } = useMenuButton();
  const menuRef = useRef<HTMLDivElement>(null);
  const nameId = useId();
  // Return here after sign-in (must run before the early returns below).
  const { signInHref } = useAuthHrefs();
  const openBugReport = useOpenBugReport();
  // In the editor's actions group, the group's flat button (icon beside the name); in the Explorer's header, its
  // full-height action.
  const inGroup = useInToolbarGroup();
  const buttonClass = inGroup ? TOOLBAR_BUTTON : `${HEADER_ACTION_BTN} ${HEADER_ACTION_TONE}`;
  const Slot = inGroup ? Fragment : HeaderGlyph;
  const discSize = inGroup ? GROUP_DISC_PX : HEADER_ICON_SLOT_PX;

  // Click-outside closes the menu. Listener installs only while
  // the menu is open so an inert button doesn't pay for it.
  useClickOutside(menuRef, closeMenu, menuOpen);

  if (!authLoaded) return null;

  if (!isSignedIn) {
    return (
      <Link href={signInHref} className={buttonClass}>
        <Slot>
          <SignInIcon size={inGroup ? 14 : 13} />
        </Slot>
        <span className={inGroup ? 'text-optical-centre' : undefined}>Sign in</span>
      </Link>
    );
  }

  const displayName = user?.name ?? user?.email ?? '';
  // Pill label: the name's first word only. Last
  // names get truncated in account UIs because most users don't
  // need the full identity on screen — the avatar dot + first name
  // is the recognisable "this is me" combo. Truncate at 16 chars
  // so a very long first name doesn't push the chevron off-pill.
  const pillLabel = (() => {
    const raw = user?.name?.split(/\s+/)[0] ?? '';
    if (!raw) return null;
    return raw.length > 16 ? `${raw.slice(0, 15)}…` : raw;
  })();

  return (
    <div className={`relative flex ${inGroup ? '' : 'h-full'}`} ref={menuRef}>
      <button
        ref={setTrigger}
        type="button"
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={buttonClass}
      >
        <Slot>
          {/* The profile picture when there is one (docs/specs/014-identity/profile-picture.md). */}
          <PictureDisc
            pictureUrl={user?.pictureUrl}
            size={discSize}
            aria-hidden
            className={`bg-brand-700 text-supporting text-white ${SOLID_BRAND_DARK}`}
          >
            {accountInitial(user)}
          </PictureDisc>
        </Slot>
        <span className={`max-w-[4.5rem] truncate ${inGroup ? 'text-optical-centre' : ''}`}>
          {pillLabel ?? 'Account'}
        </span>
      </button>
      {menuOpen ? (
        <AccountMenu trigger={trigger} onClose={closeMenu}>
          {displayName ? (
            <div
              data-menu-label=""
              id={nameId}
              aria-hidden
              className="px-3 py-2 text-supporting text-slate-500 dark:text-slate-400"
            >
              <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                {displayName}
              </p>
              {user?.email && user.email !== displayName ? (
                <p className="truncate">{user.email}</p>
              ) : null}
            </div>
          ) : null}
          {/* Account (docs/specs/007-editor/user-preferences.md): identity, email notifications and account
              deletion all live in the Settings dialog, so this opens it on
              its Account category, in place when the host can. */}
          {onOpenAccount ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                closeMenu();
                onOpenAccount();
              }}
              className="block w-full rounded-control px-3 py-2 text-left text-body text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Account
            </button>
          ) : (
            <Link
              href="/explorer?settings=account"
              role="menuitem"
              tabIndex={-1}
              onClick={closeMenu}
              className="block w-full rounded-control px-3 py-2 text-left text-body text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Account
            </Link>
          )}
          {/* Report a Bug (docs/specs/004-interface-design/report-a-bug-entries.md): focus goes back to this
              menu's button, as the item is gone by then. */}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            data-bug-report-entry=""
            aria-haspopup="dialog"
            onClick={() => {
              closeMenu();
              openBugReport({ trigger });
            }}
            className="block w-full rounded-control px-3 py-2 text-left text-body text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Report a Bug
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              closeMenu();
              track('Session', 'SignedOut');
              // Land on the marketing landing page at `/` (router worker
              // serves marketing there). Once you're signed out, the editor
              // is the wrong default, the landing page is.
              void signOut({ redirectUrl: '/' });
            }}
            className="block w-full rounded-control px-3 py-2 text-left text-body text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Sign out
          </button>
        </AccountMenu>
      ) : null}
    </div>
  );
}

function AccountMenu({
  trigger,
  onClose,
  children,
}: {
  trigger: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const { attach, surfaceProps } = useMenu({ onClose, trigger });
  return (
    <div
      ref={attach}
      {...surfaceProps}
      className="absolute right-0 top-full z-[var(--z-popover)] mt-1 w-56 rounded-control border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/10 outline-none dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/30"
    >
      {children}
    </div>
  );
}

// Door-with-arrow glyph — same 13px / 1.6 stroke convention as the
// other header icons (ShareIcon in EditorHeader, etc.) so the
// Sign-in pill reads as a peer of those buttons. Exported because the
// Explorer's "Sign in to use teams" sidebar link (docs/specs/013-workspace/teams.md) renders
// the same glyph so the two sign-in affordances read as one action.
export function SignInIcon({ size = 13 }: { size?: number } = {}) {
  return (
    <Glyph size={size} units={16}>
      <path d="M9 3h3.5A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13H9" />
      <path d="M2 8h7" />
      <path d="M6 5l3 3-3 3" />
    </Glyph>
  );
}

export function AuthControls(props: AuthControlsProps) {
  // No sign-in on this host: the header just shows its other actions.
  return useSignInAvailable() ? <AuthControlsEnabled {...props} /> : null;
}
