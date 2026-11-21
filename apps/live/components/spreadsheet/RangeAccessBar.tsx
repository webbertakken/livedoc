// The connect bar (docs/specs/029-sheets/formulas.md "Connecting two spreadsheets"): above the grid while an IMPORTRANGE
// waits for its source to be connected, as Google's "You need to connect these sheets." asks in the cell. An Editor
// connects every source waiting at once, for good; everyone else reads it. The cells say why on hover, as every
// error does.
import { useState } from 'react';
import type { WorkbookRecord } from '@livedoc/sheets';
import { Button } from '@livedoc/ui';
import { connectSheetSources } from '@/lib/api/sheet-imports';
import type { SheetsScope } from '@/lib/api/sheets';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { BAR, IMPORT_ACCESS_WORDS } from './ImportAccessBar';

export const RANGE_ACCESS_WORDS = {
  warning: 'Some formulas import ranges from other spreadsheets.',
  failed: 'Access could not be allowed. You may not be able to open those spreadsheets.',
} as const;

export function RangeAccessBar({
  scope,
  sources,
  canAllow,
  onAllowed,
  connect = connectSheetSources,
}: {
  scope: SheetsScope;
  // The spreadsheets waiting to be connected, by document id.
  sources: readonly string[];
  // An Editor's: Viewers and Participants read the bar without its button.
  canAllow: boolean;
  // The workbook as connected, shown at once rather than when the room's echo arrives.
  onAllowed?: ((workbook: WorkbookRecord) => void) | undefined;
  connect?: typeof connectSheetSources;
}) {
  const [state, setState] = useState<'idle' | 'allowing' | 'failed'>('idle');
  const onAllow = async () => {
    // Before the change is saved, so the event reaches the wire whatever follows.
    track('Spreadsheet', 'Unlocked', 'RangeAccess');
    setState('allowing');
    try {
      const connected = await connect(scope, sources);
      debugLog('[sheet imports] sources connected', {
        sources: sources.length,
        rev: connected.rev,
      });
      onAllowed?.(connected.workbook);
      setState('idle');
    } catch (error) {
      debugLog('[sheet imports] connecting failed', { error: String(error) });
      setState('failed');
    }
  };
  return (
    <div role="status" data-range-access-bar="" className={BAR}>
      <span className="font-medium">Warning:</span>
      <span>{RANGE_ACCESS_WORDS.warning}</span>
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
      {state === 'failed' ? <span role="alert">{RANGE_ACCESS_WORDS.failed}</span> : null}
    </div>
  );
}
