'use client';

// Rows in a Sheet (docs/specs/030-forms/forms.md "Responses to a Sheet", docs/specs/029-sheets/plan-links.md "Form
// responses"): which sheet, and a sentence reading it back. The document's own Sheet tabs are offered while it has
// any; then a sheet of a spreadsheet (picked as a dashboard picks one, "<Sheet> · <Spreadsheet>"), and New
// Spreadsheet. A spreadsheet is connected before the form names it, so the choice waits meanwhile and says when it
// was refused.
import { useState } from 'react';
import type { Tab } from '@livedoc/document';
import { DESTINATION_PROBLEM_TEXT, isSpreadsheetSheet } from '@livedoc/forms';
import { Select } from '@livedoc/ui';
import { sheetsOf } from '@livedoc/templates';
import { SettingsField } from '@/components/plan/settings-panel-parts';
import { SpreadsheetSheetSource } from '@/components/plan/dashboard/SpreadsheetSheetSource';
import { track } from '@/lib/telemetry';
import { useFormBuilder } from './form-builder-context';

// The select's last choices: a spreadsheet's sheet, and New Spreadsheet; the spreadsheet chosen now.
const CHOOSE = '__choose';
const NEW = '__new';
const SPREADSHEET = '__spreadsheet';

const NOTE =
  'rounded-menu bg-slate-50 px-3 py-2 text-body text-slate-700 dark:bg-slate-800/60 dark:text-slate-200';
const WARN =
  'rounded-menu bg-amber-50 px-3 py-2 text-body text-amber-900 dark:bg-amber-500/10 dark:text-amber-100';

export function SheetDestination({ tabs }: { tabs: readonly Tab[] }) {
  const b = useFormBuilder();
  const spreadsheet = b.spreadsheet;
  const [picking, setPicking] = useState(false);
  const sheets = sheetsOf(tabs);
  const at = b.form.sheet;
  const inSpreadsheet = isSpreadsheetSheet(at);
  const current = inSpreadsheet
    ? undefined
    : sheets.find((s) => s.sheetId === at?.sheetId && s.tabId === at?.tabId);
  const busy = !!spreadsheet?.busy;
  const value = picking ? CHOOSE : inSpreadsheet ? SPREADSHEET : (current?.sheetId ?? '');
  const choose = (next: string) => {
    setPicking(next === CHOOSE);
    if (next === CHOOSE || next === SPREADSHEET) return;
    if (next === NEW) {
      track('Form', 'Linked', 'NewSpreadsheet');
      void spreadsheet?.makeNew();
      return;
    }
    const s = sheets.find((x) => x.sheetId === next);
    if (s) b.actions.setResponsesTo({ kind: 'sheet', tabId: s.tabId, sheetId: s.sheetId });
  };
  return (
    <div className="flex flex-col gap-3">
      <SettingsField label="Sheet">
        <Select
          className="w-full"
          selectClassName="text-body"
          value={value}
          disabled={!b.canEdit || busy}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="" disabled>
            Choose a sheet…
          </option>
          {sheets.map((s) => (
            <option key={s.sheetId} value={s.sheetId}>
              {s.name}
            </option>
          ))}
          {inSpreadsheet ? (
            <option value={SPREADSHEET}>{spreadsheet?.name ?? 'A spreadsheet’s sheet'}</option>
          ) : null}
          {b.canEdit && spreadsheet ? (
            <>
              <option value={CHOOSE}>From a spreadsheet…</option>
              <option value={NEW}>+ New Spreadsheet</option>
            </>
          ) : null}
        </Select>
      </SettingsField>
      {picking && spreadsheet ? (
        <div className="rounded-menu border border-slate-200 p-2 dark:border-slate-700">
          <SpreadsheetSheetSource
            documentId={inSpreadsheet ? at.documentId : ''}
            sheetId={inSpreadsheet ? at.sheetId : ''}
            onPick={(to) => {
              track('Form', 'Linked', 'ChooseSpreadsheet');
              setPicking(false);
              void spreadsheet.choose(to);
            }}
          />
        </div>
      ) : null}
      {readback()}
    </div>
  );

  function readback() {
    if (busy)
      return (
        <p role="status" className={NOTE}>
          Connecting the form to the spreadsheet…
        </p>
      );
    if (spreadsheet?.failure)
      return (
        <p role="alert" className={WARN}>
          {spreadsheet.failure}
        </p>
      );
    if (inSpreadsheet) {
      const state = spreadsheet?.read?.state;
      if (state === 'too-large')
        return (
          <p className={NOTE}>
            Each response becomes a row on its sheet. This spreadsheet is too large to show here.
          </p>
        );
      if (state === 'failed')
        return (
          <p role="status" className={WARN}>
            The spreadsheet couldn’t be read just now. Responses still go to it.
          </p>
        );
      if (spreadsheet?.problem)
        return (
          <p role="status" className={WARN}>
            {DESTINATION_PROBLEM_TEXT[spreadsheet.problem]}
          </p>
        );
      return (
        <p className={NOTE}>
          {spreadsheet?.name ? (
            <>
              Each response becomes a row on <strong>{spreadsheet.name}</strong>, a column per
              question. No mapping needed.
            </>
          ) : (
            'Finding the spreadsheet’s sheet…'
          )}
        </p>
      );
    }
    return current ? (
      <p className={NOTE}>
        Each response becomes a row on <strong>{current.name}</strong>, a column per question. No
        mapping needed.
      </p>
    ) : (
      <p role="status" className={WARN}>
        {DESTINATION_PROBLEM_TEXT.sheet_missing}
      </p>
    );
  }
}
