// The Allow Access bar (docs/specs/029-sheets/imports.md "Allow access"): above the grid while a formula imports from
// the web and no Editor has allowed it, as Google's warning bar. An Editor allows it for good; everyone else reads it.
import { useState } from 'react';
import { Button } from '@livedoc/ui';
import { allowSheetImports } from '@/lib/api/sheet-imports';
import type { SheetsScope } from '@/lib/api/sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

export const IMPORT_ACCESS_WORDS = {
  warning: 'Some formulas are trying to send and receive data from external parties.',
  editorsOnly: 'An editor can allow access.',
  allow: 'Allow Access',
  allowing: 'Allowing…',
  failed: 'Access could not be allowed. Try again.',
} as const;

export function ImportAccessBar({
  scope,
  canAllow,
  allow = allowSheetImports,
}: {
  scope: SheetsScope;
  // An Editor's: Viewers and Participants read the bar without its button.
  canAllow: boolean;
  allow?: typeof allowSheetImports;
}) {
  const [state, setState] = useState<'idle' | 'allowing' | 'failed'>('idle');
  const onAllow = async () => {
    // Before the change is saved, so the event reaches the wire whatever follows.
    track('Spreadsheet', 'Unlocked', 'ImportAccess');
    setState('allowing');
    try {
      await allow(scope);
      debugLog('[sheet imports] access allowed');
      // The room sends the workbook to everyone, this page too: the bar goes when it arrives.
    } catch (error) {
      debugLog('[sheet imports] allowing failed', { error: String(error) });
      setState('failed');
    }
  };
  return (
    <div
      role="status"
      data-import-access-bar=""
      className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
    >
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
