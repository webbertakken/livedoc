'use client';

// Dark pages (docs/specs/035-pdf-documents/dark-pages.md "What it is, and is not", "The setting", "Accessibility"):
// one person's setting, kept with their preferences so it follows the account, read live from every place that
// flips it. Offered in the dark scheme only, and never where the system forces its colours; the pages show dark only
// while it is offered and on. Missing is "not yet asked": the pages show as paper until the question is answered.
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { PageLook } from '@livedoc/pdf-documents';
import { useAppearance, useMediaQuery } from '@livedoc/ui';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  PREFERENCES_CHANGED_EVENT,
  readUserPreferences,
  writeUserPreferences,
} from '@/lib/user-preferences';
import { DARK_PAGES } from './pdf-menus';
import { usePdfDarkPagesQuestion } from './usePdfDarkPagesQuestion';

/** "Errors": said when the choice could not be kept. */
export const DARK_PAGES_NOT_SAVED_COPY =
  'Your choice couldn’t be saved. It applies until you close this PDF.';

const FORCED_COLOURS = '(forced-colors: active)';

function subscribe(changed: () => void): () => void {
  window.addEventListener(PREFERENCES_CHANGED_EVENT, changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(PREFERENCES_CHANGED_EVENT, changed);
    window.removeEventListener('storage', changed);
  };
}
const stored = (): boolean | undefined => readUserPreferences().pdfDarkPages;
const notOnTheServer = (): undefined => undefined;

/** Keeps the setting on the freshest preferences, synced for `ownerId`; false where it could not be kept. */
export function keepDarkPages(on: boolean, ownerId: string | null): boolean {
  writeUserPreferences({ ...readUserPreferences(), pdfDarkPages: on }, ownerId);
  return stored() === on;
}

export function usePdfDarkPages({
  ownerId,
  onProblem,
  say = () => {},
}: {
  // The person: their preferences sync to their account, or to this browser.
  ownerId: string | null;
  // What the title row says when the choice could not be kept.
  onProblem: (problem: string) => void;
  // A one-line toast, for what the first-time question says when dismissed.
  say?: (message: string) => void;
}) {
  const kept = useSyncExternalStore(subscribe, stored, notOnTheServer);
  // A choice that could not be kept still applies while this PDF is open.
  const [unkept, setUnkept] = useState<boolean | null>(null);
  const setting = unkept ?? kept;
  const { appearance } = useAppearance();
  const forced = useMediaQuery(FORCED_COLOURS);
  const offered = appearance === 'dark' && !forced;
  const look: PageLook = offered && setting === true ? 'dark' : 'paper';

  /** Sets it, as a person’s choice: the answer to the question too. Counted by the caller, before it is kept. */
  const choose = useCallback(
    (on: boolean) => {
      debugLog(`[pdf] dark-pages on=${on ? 'yes' : 'no'}`);
      if (keepDarkPages(on, ownerId)) return setUnkept(null);
      debugLog('[pdf] dark-pages not-saved');
      setUnkept(on);
      onProblem(DARK_PAGES_NOT_SAVED_COPY);
    },
    [ownerId, onProblem],
  );

  const actions: OfficeActions = useMemo(
    () =>
      offered
        ? {
            [DARK_PAGES]: {
              run: () => {
                const on = setting !== true;
                // Counted before it is kept, as every setting’s flip is.
                track('Pdf', 'Toggled', on ? 'DarkPagesOn' : 'DarkPagesOff');
                choose(on);
              },
              checked: setting === true,
            },
          }
        : {},
    [offered, setting, choose],
  );

  const question = usePdfDarkPagesQuestion({ offered, setting, choose, say });

  return { look, offered, setting, choose, actions, question };
}
