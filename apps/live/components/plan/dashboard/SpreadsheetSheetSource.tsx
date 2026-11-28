'use client';

// A dashboard picker's Spreadsheets (docs/specs/029-sheets/plan-links.md "Dashboards", D505): the person's own
// spreadsheets as Copy To lists them, then the sheets of the one picked, each "<Sheet> · <Spreadsheet>", with All
// Spreadsheets to go back. Picking a sheet hands its spreadsheet and id on; the picker goes on as for a Sheet of the
// document.
import { useState } from 'react';
import { SpreadsheetPickList } from '@/components/spreadsheet/SpreadsheetPickList';
import { useSheetsBridgeContext } from '@/hooks/sheets/useSheetsBridge';
import { TabWaiting } from './TabWaiting';
import { MUTED_LINE, ON, ROW, SECTION } from './sheet-source-parts';
import { retryLinkedRead } from './linked-sheets';
import { useLinkedRead } from './useLinkedSheetRead';

export function SpreadsheetSheetSource({
  documentId,
  sheetId,
  onPick,
}: {
  // The spreadsheet and sheet chosen now; '' for none.
  documentId: string;
  sheetId: string;
  onPick: (link: { documentId: string; sheetId: string }) => void;
}) {
  const scope = useSheetsBridgeContext()?.scope;
  const [open, setOpen] = useState(documentId);
  if (!scope) return null;
  return (
    <section aria-label="Spreadsheets" className="flex flex-col gap-1">
      <h3 className={SECTION}>Spreadsheets</h3>
      {open ? (
        <SheetsOf
          documentId={open}
          chosen={open === documentId ? sheetId : ''}
          onBack={() => setOpen('')}
          onPick={(id) => onPick({ documentId: open, sheetId: id })}
        />
      ) : (
        <SpreadsheetPickList
          ownerId={scope.ownerId}
          currentId={scope.documentId}
          what="dashboard sheet source"
          onPick={(picked) => setOpen(picked.documentId)}
        />
      )}
    </section>
  );
}

function SheetsOf({
  documentId,
  chosen,
  onBack,
  onPick,
}: {
  documentId: string;
  chosen: string;
  onBack: () => void;
  onPick: (sheetId: string) => void;
}) {
  const read = useLinkedRead(documentId, '');
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className={`${ROW} text-brand-700 dark:text-brand-300`}
      >
        All Spreadsheets
      </button>
      {read.state === 'ready' ? (
        read.sheets.length === 0 ? (
          <p className={MUTED_LINE}>This spreadsheet has no sheets to show.</p>
        ) : (
          read.sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === chosen}
              onClick={() => onPick(s.id)}
              className={`${ROW} ${s.id === chosen ? ON : ''}`}
            >
              <span className="truncate">
                {s.title} · {read.name}
              </span>
            </button>
          ))
        )
      ) : read.state === 'failed' ? (
        <TabWaiting
          name="this spreadsheet’s sheets"
          status="failed"
          onRetry={() => retryLinkedRead(documentId, '')}
        />
      ) : (
        <p className={MUTED_LINE}>
          {read.state === 'loading'
            ? 'Finding this spreadsheet’s sheets…'
            : read.state === 'denied'
              ? 'You don’t have access to this spreadsheet.'
              : 'This spreadsheet is too large to read here.'}
        </p>
      )}
    </>
  );
}
