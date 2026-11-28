'use client';

// Protect Sheets and Ranges' form (docs/specs/029-sheets/data-tools.md "Protected ranges"): a range (any sheet's,
// `Sheet2!A1:B4`) or a whole sheet with Except Certain Cells, a description, and who may write there: Show a Warning,
// Editors Only or Only the Owner. Done is one change, one undo step; a range it cannot read says why under its field.
import { readWorkbook } from '@/components/sheets/read-workbook';
import { useId, useState } from 'react';
import { Button, Select, TextInput } from '@livedoc/ui';
import {
  formatRange,
  makeAxisIds,
  PROTECTION_DESCRIPTION_MAX,
  PROTECTION_EXCEPTIONS_MAX,
  protectionWrites,
  sourceFromText,
  type IdRange,
  type ListedProtection,
  type Protection,
  type ProtectionPermission,
} from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { debugLog } from '@/lib/debug-log';

export const PROTECTED_RANGE_UNREAD = "That range can't be read";

/** What the form opens on: a range over the selection, or a sheet (by id). */
export type ProtectionStart = { what: 'range' } | { what: 'sheet'; sheetId: string };

const PERMISSIONS: readonly { can: ProtectionPermission; label: string }[] = [
  { can: 'warn', label: 'Show a Warning When Editing This Range' },
  { can: 'editors', label: 'Editors Only' },
  { can: 'owner', label: 'Only the Owner' },
];

const label = 'block text-supporting text-(--office-muted)';
const error = 'text-supporting text-red-600 dark:text-red-400';
const BOX = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-2 text-body pointer-coarse:min-h-11';

export function ProtectionForm({
  existing,
  start = { what: 'range' },
  onClose,
}: {
  // The protection edited; none for a new one.
  existing: ListedProtection | undefined;
  start?: ProtectionStart;
  onClose: () => void;
}) {
  const c = useSheetController();
  const id = useId();
  const sheets = readWorkbook(c.version, () => c.workbook.sheetList());
  const was = existing?.protection;
  const [what, setWhat] = useState<'range' | 'sheet'>(
    was ? (was.range ? 'range' : 'sheet') : start.what,
  );
  const [sheetId, setSheetId] = useState(
    existing?.sheetId ?? (start.what === 'sheet' ? start.sheetId : c.sheet.id),
  );
  // A new range is the selection until typed over, so cells picked while the form is open fill it.
  const [typed, setTyped] = useState<string | null>(was?.range ? existing!.where : null);
  const range = typed ?? formatRange(c.selection.ranges[c.selection.ranges.length - 1]!);
  const exceptText = (x: IdRange) => {
    const layout = (sheetId === c.sheet.id ? c.sheet : c.workbook.sheet(sheetId))?.layout;
    const ix = layout ? { r: layout.rows, c: layout.cols } : null;
    const at = ix && {
      r1: ix.r.indexOf(x.r1),
      c1: ix.c.indexOf(x.c1),
      r2: ix.r.indexOf(x.r2),
      c2: ix.c.indexOf(x.c2),
    };
    return at && at.r1 >= 0 && at.c1 >= 0 ? formatRange(at) : '';
  };
  const [excepting, setExcepting] = useState(!!was?.except?.length);
  const [exceptions, setExceptions] = useState<string[]>(
    was?.except?.length ? was.except.map(exceptText) : [''],
  );
  const [description, setDescription] = useState(was?.description ?? '');
  const [can, setCan] = useState<ProtectionPermission>(was?.can ?? 'editors');
  const [why, setWhy] = useState<{ range?: string; except?: number }>({});
  const refuse = (problem: { range?: string; except?: number }) => {
    debugLog('[workbook] protection refused', problem);
    setWhy(problem);
  };
  // A range typed on the sheet `on` (another sheet's name aside): its ids and its sheet, or null.
  const read = (text: string, on: string) => {
    const at = sourceFromText(c.workbook.ctxFor(on), text);
    if (!at) return null;
    const { s, st: _st, ...ids } = at;
    return { sheetId: s ?? on, ids };
  };
  const done = () => {
    const text = description.trim();
    const base = {
      id: was?.id ?? makeAxisIds(1)[0]!,
      can,
      ...(text ? { description: text } : {}),
    };
    let target = sheetId;
    let protection: Protection;
    if (what === 'range') {
      const at = read(range, c.sheet.id);
      if (!at) return refuse({ range: PROTECTED_RANGE_UNREAD });
      target = at.sheetId;
      protection = { ...base, range: at.ids };
    } else {
      const except: IdRange[] = [];
      for (const [i, x] of (excepting ? exceptions : []).entries()) {
        if (!x.trim()) continue;
        const at = read(x, sheetId);
        if (!at || at.sheetId !== sheetId) return refuse({ except: i });
        except.push(at.ids);
      }
      // A file's password stays on its sheet's protection while it guards that sheet (standard-mapping.md D351).
      const kept = was?.kept && existing?.sheetId === sheetId ? { kept: was.kept } : {};
      protection = { ...base, ...(except.length ? { except } : {}), ...kept };
    }
    const edit = {
      ...(existing ? { was: { sheetId: existing.sheetId, id: existing.protection.id } } : {}),
      sheetId: target,
      protection,
    };
    if (!c.writeAll(protectionWrites(edit), 'Protection')) return;
    debugLog('[workbook] protection saved', { can, sheet: what === 'sheet' });
    onClose();
  };
  return (
    <form
      className="flex flex-col gap-3"
      aria-label={existing ? 'Edit Protection' : 'Add a Sheet or Range'}
      onSubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <div role="radiogroup" aria-label="Protect" className="flex items-center gap-4">
        {(['range', 'sheet'] as const).map((w) => (
          <label key={w} className={OPTION}>
            <input
              type="radio"
              name={`${id}-what`}
              className={BOX}
              checked={what === w}
              onChange={() => {
                setWhy({});
                setWhat(w);
              }}
            />
            {w === 'range' ? 'Range' : 'Sheet'}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className={label}>
          Description
        </label>
        <TextInput
          id={`${id}-description`}
          value={description}
          maxLength={PROTECTION_DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {what === 'range' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-range`} className={label}>
            Range
          </label>
          <TextInput
            id={`${id}-range`}
            autoFocus
            value={range}
            aria-invalid={!!why.range}
            aria-describedby={why.range ? `${id}-range-why` : undefined}
            onChange={(e) => {
              setWhy({});
              setTyped(e.target.value);
            }}
          />
          {why.range ? (
            <span id={`${id}-range-why`} className={error} role="alert">
              {why.range}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-sheet`} className={label}>
              Sheet
            </label>
            <Select
              id={`${id}-sheet`}
              value={sheetId}
              onChange={(e) => {
                setWhy({});
                setSheetId(e.target.value);
              }}
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
          <label className={OPTION}>
            <input
              type="checkbox"
              className={BOX}
              checked={excepting}
              onChange={(e) => setExcepting(e.target.checked)}
            />
            Except Certain Cells
          </label>
          {excepting ? (
            <div className="flex flex-col gap-2">
              {exceptions.map((x, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <TextInput
                    aria-label={`Exception ${i + 1}`}
                    value={x}
                    aria-invalid={why.except === i}
                    onChange={(e) => {
                      setWhy({});
                      setExceptions(exceptions.map((y, j) => (j === i ? e.target.value : y)));
                    }}
                  />
                  {why.except === i ? (
                    <span className={error} role="alert">
                      {PROTECTED_RANGE_UNREAD}
                    </span>
                  ) : null}
                </div>
              ))}
              {exceptions.length < PROTECTION_EXCEPTIONS_MAX ? (
                <button
                  type="button"
                  className="mr-auto min-h-row cursor-pointer rounded-control px-1 font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
                  onClick={() => setExceptions([...exceptions, ''])}
                >
                  Add Another Range
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <fieldset className="flex flex-col gap-1">
        <legend className={label}>Permissions</legend>
        {PERMISSIONS.map((p) => (
          <label key={p.can} className={OPTION}>
            <input
              type="radio"
              name={`${id}-can`}
              className={BOX}
              checked={can === p.can}
              onChange={() => setCan(p.can)}
            />
            {p.label}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="xs">
          Done
        </Button>
      </div>
    </form>
  );
}
