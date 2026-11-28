'use client';

// Data › Protect Sheets and Ranges' side panel (docs/specs/029-sheets/data-tools.md "Protected ranges"), for everyone:
// the workbook's protections, each going to its range or sheet; an Editor's rows Edit and Remove on a protection that
// admits them, and Add a Sheet or Range under the list. It opens on the form for an Editor when asked (Protect Range,
// Protect Sheet) or when nothing is protected yet.
import { readWorkbook } from '@/components/sheets/read-workbook';
import { useState } from 'react';
import { Button, PencilIcon, TrashIcon } from '@livedoc/ui';
import {
  PERMISSION_SHORT,
  Protection,
  protectionRemoval,
  workbookProtections,
  type ListedProtection,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { useSheetNavigation } from '@/components/sheets/sheet-navigation';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { ProtectionForm, type ProtectionStart } from './ProtectionForm';

export const NOTHING_PROTECTED_YET = 'Nothing is protected yet.';
export const NOTHING_PROTECTED = 'No protected sheets or ranges.';

// What the form is open on: a protection (by its sheet and id), a new one, or nothing (the list).
type Editing = { sheetId: string; id: string } | ProtectionStart | null;

const ROW_BUTTON =
  'flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-control text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

const keyOf = (x: ListedProtection) => `${x.sheetId}:${x.protection.id}`;

export function SpreadsheetProtectionBody({
  actions,
  start = null,
}: {
  actions: SheetActions;
  // Protect Range or Protect Sheet: the form on a new protection, whatever the list holds.
  start?: ProtectionStart | null;
}) {
  const c = useSheetController();
  const open = useSheetNavigation();
  const sheets = readWorkbook(c.version, () => c.workbook.sheetList()).map((s) =>
    s.id === c.sheet.id ? c.sheet : s,
  );
  const listed = workbookProtections(
    sheets.some((s) => s.id === c.sheet.id) ? sheets : [c.sheet, ...sheets],
    c.sheet.id,
  );
  const caller = c.store.protection() ?? { owner: false, editor: c.canShape };
  const [editing, setEditing] = useState<Editing>(() =>
    c.canShape && (start || listed.length === 0) ? (start ?? { what: 'range' }) : null,
  );
  const [removing, setRemoving] = useState<string | null>(null);
  const back = () => setEditing(null);
  if (editing) {
    const existing =
      'id' in editing
        ? listed.find((x) => x.sheetId === editing.sheetId && x.protection.id === editing.id)
        : undefined;
    return (
      <ProtectionForm
        key={existing ? keyOf(existing) : 'new'}
        existing={existing}
        {...('what' in editing ? { start: editing } : {})}
        onClose={back}
      />
    );
  }
  const goTo = (x: ListedProtection) => {
    const layout = sheets.find((s) => s.id === x.sheetId)?.layout;
    const r = x.protection.range;
    const range =
      layout && r
        ? {
            r1: layout.rows.indexOf(r.r1),
            c1: layout.cols.indexOf(r.c1),
            r2: layout.rows.indexOf(r.r2),
            c2: layout.cols.indexOf(r.c2),
          }
        : { r1: 0, c1: 0, r2: 0, c2: 0 };
    if (x.sheetId === c.sheet.id) actions.goTo(range);
    else open?.(x.sheetId, range);
  };
  const remove = (x: ListedProtection) => {
    if (!c.writeAll([protectionRemoval(x.sheetId, x.protection.id)], 'Protection')) return;
    debugLog('[workbook] protection removed', { can: x.protection.can });
    setRemoving(null);
  };
  return (
    <>
      {listed.length ? (
        <ul className="flex flex-col gap-1" aria-label="Protected sheets and ranges">
          {listed.map((x) => (
            <li
              key={keyOf(x)}
              className="flex flex-col gap-1 rounded-control px-1 py-1 hover:bg-(--office-hover)"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Go To ${x.label}`}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  onClick={() => goTo(x)}
                >
                  <span className="block truncate">{x.label}</span>
                  <span className="block truncate text-supporting text-(--office-muted)">
                    {x.label === x.where ? '' : `${x.where} · `}
                    {PERMISSION_SHORT[x.protection.can]}
                  </span>
                </button>
                {c.canShape && Protection.admits(x.protection, caller) ? (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit ${x.label}`}
                      className={ROW_BUTTON}
                      onClick={() => setEditing({ sheetId: x.sheetId, id: x.protection.id })}
                    >
                      <PencilIcon size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${x.label}`}
                      className={ROW_BUTTON}
                      onClick={() => setRemoving(keyOf(x))}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </>
                ) : null}
              </div>
              {removing === keyOf(x) ? (
                <div
                  role="alertdialog"
                  aria-label="Remove protection"
                  className="flex items-center gap-2"
                >
                  <span className="flex-1 text-supporting">Remove this protection?</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={() => setRemoving(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="xs" onClick={() => remove(x)}>
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-supporting text-(--office-muted)">
          {c.canShape ? NOTHING_PROTECTED_YET : NOTHING_PROTECTED}
        </p>
      )}
      {c.canShape ? (
        <button
          type="button"
          className="mr-auto min-h-row cursor-pointer rounded-control px-1 font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
          onClick={() => setEditing({ what: 'range' })}
        >
          Add a Sheet or Range
        </button>
      ) : null}
    </>
  );
}
