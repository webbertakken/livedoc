// The Allow Access bar (docs/specs/029-sheets/imports.md "Allow access"): above the grid while a formula imports from
// the web and no Editor has allowed it, as Google's warning bar. An Editor allows it for good; everyone else reads it.
// A spreadsheet in This Browser is offered Sync Document first ("A spreadsheet in This Browser"), as Share is.
import { useState } from 'react';
import type { WorkbookRecord } from '@livedoc/sheets';
import { Button } from '@livedoc/ui';
import { allowSheetImports } from '@/lib/api/sheet-imports';
import type { SheetsScope } from '@/lib/api/sheets';
import { debugLog } from '@/lib/debug-log';
import { syncFailureMessage } from '@/lib/offline/offline-convert';
import { track } from '@/lib/telemetry';

export const IMPORT_ACCESS_WORDS = {
  warning: 'Some formulas are trying to send and receive data from external parties.',
  editorsOnly: 'An editor can allow access.',
  allow: 'Allow Access',
  allowing: 'Allowing…',
  failed: 'Access could not be allowed. Try again.',
  offline:
    'This spreadsheet is saved only in this browser. Fetching data from the web needs it on LiveDoc.',
  sync: 'Sync Document',
  syncing: 'Syncing…',
} as const;

/** The document's own Sync Document (offline-mode.md "Syncing in place"), and whether the reader is known yet. */
export type ImportSync = { run: () => Promise<void>; ready: boolean };

export const BAR =
  'flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50';

export function ImportAccessBar({
  scope,
  canAllow,
  offline = false,
  sync,
  onAllowed,
  allow = allowSheetImports,
}: {
  scope: SheetsScope;
  // An Editor's: Viewers and Participants read the bar without its button.
  canAllow: boolean;
  // The document is in This Browser: Sync Document comes before Allow Access.
  offline?: boolean;
  sync?: ImportSync | undefined;
  // The workbook as allowed, shown at once rather than when the room's echo arrives.
  onAllowed?: ((workbook: WorkbookRecord) => void) | undefined;
  allow?: typeof allowSheetImports;
}) {
  return offline ? (
    <OfflineBar sync={sync} />
  ) : (
    <AllowBar scope={scope} canAllow={canAllow} allow={allow} onAllowed={onAllowed} />
  );
}

function AllowBar({
  scope,
  canAllow,
  allow,
  onAllowed,
}: {
  scope: SheetsScope;
  canAllow: boolean;
  allow: typeof allowSheetImports;
  onAllowed: ((workbook: WorkbookRecord) => void) | undefined;
}) {
  const [state, setState] = useState<'idle' | 'allowing' | 'failed'>('idle');
  const onAllow = async () => {
    // Before the change is saved, so the event reaches the wire whatever follows.
    track('Spreadsheet', 'Unlocked', 'ImportAccess');
    setState('allowing');
    try {
      const allowed = await allow(scope);
      debugLog('[sheet imports] access allowed', { rev: allowed.rev });
      // The room sends the workbook to everyone; this page shows it at once, its connection maybe still joining.
      onAllowed?.(allowed.workbook);
    } catch (error) {
      debugLog('[sheet imports] allowing failed', { error: String(error) });
      setState('failed');
    }
  };
  return (
    <div role="status" data-import-access-bar="" className={BAR}>
      <span className="font-medium">Warning:</span>
      <span>{IMPORT_ACCESS_WORDS.warning}</span>
      {canAllow ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={state === 'allowing'}
          onClick={() => void onAllow()}
        >
          {state === 'allowing' ? IMPORT_ACCESS_WORDS.allowing : IMPORT_ACCESS_WORDS.allow}
        </Button>
      ) : (
        <span>{IMPORT_ACCESS_WORDS.editorsOnly}</span>
      )}
      {state === 'failed' ? <span role="alert">{IMPORT_ACCESS_WORDS.failed}</span> : null}
    </div>
  );
}

function OfflineBar({ sync }: { sync: ImportSync | undefined }) {
  const [state, setState] = useState<{ busy: boolean; failure: string | null }>({
    busy: false,
    failure: null,
  });
  // Reached only from the button, which waits for the reader and for the sync under way.
  const onSync = async (run: ImportSync['run']) => {
    setState({ busy: true, failure: null });
    try {
      await run();
      debugLog('[sheet imports] synced for imports');
      // The document is on LiveDoc now: the bar turns into Allow Access, the spinner staying until it does.
    } catch (error) {
      debugLog('[sheet imports] sync failed', { error: String(error) });
      setState({ busy: false, failure: syncFailureMessage(error) });
    }
  };
  return (
    <div role="status" data-import-access-bar="offline" className={BAR}>
      <span className="font-medium">Warning:</span>
      <span>{IMPORT_ACCESS_WORDS.offline}</span>
      {sync ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={state.busy || !sync.ready}
          aria-busy={state.busy}
          onClick={() => void onSync(sync.run)}
        >
          {state.busy ? IMPORT_ACCESS_WORDS.syncing : IMPORT_ACCESS_WORDS.sync}
        </Button>
      ) : null}
      {state.failure ? <span role="alert">{state.failure}</span> : null}
    </div>
  );
}
