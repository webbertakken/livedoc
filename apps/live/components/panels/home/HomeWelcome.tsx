'use client';

// Home's first run (docs/specs/013-workspace/explorer-home.md "First run"): for a person with nothing yet, three
// sections in place of Jump Back In and What Happened, drawn as small tiles. Start Blank (each mode's blank), Popular
// Templates (the shared Popular list's first four), and Already Have Work? (the way back for someone signed out, and the Explorer's own
// imports). Each start makes its document at once through /new. Loaded only for a first run (HomePane), so the
// template previews never weigh on anyone else's Home.

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Tooltip } from '@livedoc/ui';
import type { TemplateKind } from '@livedoc/templates';
import { track } from '@/lib/telemetry';
import { useAuthHrefs } from '@/components/chrome/auth-shared';
import { TemplatePicture } from '@/components/start/template-card';
import { templateOf } from '@/components/start/start-template-items';
import { WELCOME_ALL_TEMPLATES_HREF, WELCOME_COPY } from '@/app/explorer/home/first-run';
import {
  WELCOME_BLANKS,
  WELCOME_POPULAR,
  welcomeStartHref,
} from '@/app/explorer/home/first-run-starts';
import { HomeSection } from './HomeSection';
import { CARD_SURFACE, FOCUS_RING, GRID_THUMB, MUTED, PANEL_SURFACE } from './home-styles';
import { assignAppLocation } from '@/lib/app-location';
import { markExplorerSettled } from '@/app/explorer/explorer-settled';

export function HomeWelcome({
  offerSignIn,
  importToolbar,
}: {
  /** A guest on a deployment with sign-in: they may have been signed out. */
  offerSignIn: boolean;
  /** The Explorer's Import From control, filing into My Documents; absent when no source is available. */
  importToolbar?: ReactNode;
}) {
  useEffect(() => {
    track('Home', 'Opened', 'Welcome');
    // The first run's landing has drawn: what the Explorer fetches ahead may start (explorer-settled.ts).
    markExplorerSettled();
  }, []);
  const haveWork = offerSignIn || Boolean(importToolbar);
  return (
    <div className="flex flex-col gap-6" data-home-welcome="">
      <HomeSection id="start-blank" title={WELCOME_COPY.blanksTitle} busy={false}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {WELCOME_BLANKS.map((kind) => (
            <li key={kind} className="min-w-0">
              <StartTile kind={kind} blank />
            </li>
          ))}
        </ul>
      </HomeSection>

      <HomeSection
        id="popular-templates"
        title={WELCOME_COPY.popularTitle}
        busy={false}
        link={{
          href: WELCOME_ALL_TEMPLATES_HREF,
          label: WELCOME_COPY.allTemplates,
          onNavigate: () => assignAppLocation(WELCOME_ALL_TEMPLATES_HREF),
          onActivate: () => track('Home', 'Selected', 'Welcome.AllTemplates'),
        }}
      >
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {WELCOME_POPULAR.map((kind) => (
            <li key={kind} className="min-w-0">
              <StartTile kind={kind} blank={false} />
            </li>
          ))}
        </ul>
      </HomeSection>

      {haveWork ? (
        <HomeSection id="have-work" title={WELCOME_COPY.haveWorkTitle} busy={false}>
          <div className="grid gap-3 sm:grid-cols-2">
            {offerSignIn ? <SignInCard /> : null}
            {importToolbar ? (
              <div className={`flex flex-col gap-2 rounded-surface p-4 ${PANEL_SURFACE}`}>
                <h3 className="text-panel-title text-slate-900 dark:text-slate-100">
                  {WELCOME_COPY.importTitle}
                </h3>
                <p className={`text-supporting ${MUTED}`}>{WELCOME_COPY.importLine}</p>
                <div className="mt-auto pt-1">{importToolbar}</div>
              </div>
            ) : null}
          </div>
        </HomeSection>
      ) : null}
    </div>
  );
}

/** One start, drawn as Jump Back In draws a document: its preview with its name under it and a quiet line. */
function StartTile({ kind, blank }: { kind: TemplateKind; blank: boolean }) {
  const t = templateOf(kind);
  return (
    <Tooltip label={t.description}>
      <a
        href={welcomeStartHref(kind)}
        data-welcome-start={kind}
        onClick={() => track('Home', 'Selected', blank ? 'Welcome.Blank' : 'Welcome.Template')}
        className={`group block min-w-0 rounded-control ${FOCUS_RING}`}
      >
        <span
          aria-hidden
          className={`block overflow-hidden rounded-control p-1 ${GRID_THUMB} ${CARD_SURFACE}`}
        >
          <TemplatePicture kind={kind} />
        </span>
        <span className="mt-1 block truncate text-supporting text-slate-700 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">
          {t.title}
        </span>
        <span className={`block truncate text-supporting ${MUTED}`}>{t.description}</span>
      </a>
    </Tooltip>
  );
}

/** The way back for someone who was signed out: a plain card with a brand Sign In button. */
function SignInCard() {
  const { signInHref } = useAuthHrefs();
  return (
    <div className={`flex flex-col gap-2 rounded-surface p-4 ${PANEL_SURFACE}`}>
      <h3 className="text-panel-title text-slate-900 dark:text-slate-100">
        {WELCOME_COPY.signInTitle}
      </h3>
      <p className={`text-supporting ${MUTED}`}>{WELCOME_COPY.signInLine}</p>
      <Link
        href={signInHref}
        onClick={() => track('Home', 'Selected', 'Welcome.SignIn')}
        className={`mt-auto inline-flex h-field items-center self-start rounded-control bg-brand-700 px-3 text-body font-medium text-white transition hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-700 ${FOCUS_RING}`}
      >
        {WELCOME_COPY.signIn}
      </Link>
    </div>
  );
}
