'use client';

import Link from 'next/link';
import { SignInIcon } from '@/components/chrome/AuthControls';
import { useAuthHrefs } from '@/components/chrome/auth-shared';

// The guest's sign-in nudge, last in Spaces in place of New Team
// (docs/specs/013-workspace/explorer-structure.md); sidebarGroups decides when it shows. A small card inside the
// sidebar's card: a faint brand wash, the sign-in glyph, a title and one quiet line (explorer-structure.md "Look").
export function SidebarSignInNudge() {
  const { signInHref } = useAuthHrefs();
  return (
    <Link
      href={signInHref}
      className="mt-3 flex items-start gap-2 rounded-menu border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-3 text-left transition hover:border-brand-300 hover:from-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:border-slate-700 dark:from-slate-800 dark:to-slate-800/40 dark:hover:border-brand-500/50 dark:hover:from-brand-500/15"
    >
      <span className="mt-0.5 shrink-0 text-brand-700 dark:text-brand-400">
        <SignInIcon />
      </span>
      <span>
        <span className="block text-body text-slate-700 dark:text-slate-100">
          Sign in to access Teams
        </span>
        <span className="mt-0.5 block text-supporting text-slate-500 dark:text-slate-400">
          Free, and your guest documents come with you.
        </span>
      </span>
    </Link>
  );
}
