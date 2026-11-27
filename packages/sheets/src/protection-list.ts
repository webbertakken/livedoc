// The Protect Sheets and Ranges panel's list and writes (docs/specs/029-sheets/data-tools.md "Protected ranges"): every
// sheet's protections in sheet order then place, each by its description, else where it stands; and the writes a
// protection made, changed, moved to another sheet or removed makes, as one change.
import { formatRange } from './address';
import { quoteSheet } from './formula/stored';
import { posRangeOf } from './layout';
import type { Protection, ProtectionPermission } from './protection';
import type { SheetLayout } from './sheet';
import type { SheetWrite } from './store';

/** A permission's short name in the list. */
export const PERMISSION_SHORT: Readonly<Record<ProtectionPermission, string>> = {
  warn: 'Warning',
  editors: 'Editors',
  owner: 'Owner',
};

/** A protection as the list shows it: where it stands (`A1:B4`, `Sheet2!A1:B4`, `Sheet2`) and its label. */
export type ListedProtection = {
  sheetId: string;
  protection: Protection;
  where: string;
  label: string;
};

/** The workbook's protections, in sheet order then place (a sheet's first); one whose cells are gone is left out. */
export function workbookProtections(
  sheets: readonly { id: string; title: string; layout: SheetLayout }[],
  openId: string,
): ListedProtection[] {
  return sheets.flatMap((s) => {
    const placed = (s.layout.protections ?? []).flatMap((p) => {
      if (!p.range) return [{ p, r: -1, c: -1, where: s.title }];
      const box = posRangeOf(s.layout, p.range);
      if (!box) return [];
      const at = formatRange(box);
      return [
        { p, r: box.r1, c: box.c1, where: s.id === openId ? at : `${quoteSheet(s.title)}!${at}` },
      ];
    });
    placed.sort((a, b) => a.r - b.r || a.c - b.c);
    return placed.map(({ p, where }) => ({
      sheetId: s.id,
      protection: p,
      where,
      label: p.description || where,
    }));
  });
}

/** A protection made or changed: `was` its sheet and id before (none for a new one), then its sheet and itself. */
export type ProtectionEdit = {
  was?: { sheetId: string; id: string };
  sheetId: string;
  protection: Protection;
};

/** The writes an edit makes, one change: on its sheet set; moved to another sheet, taken off one and put on the other. */
export function protectionWrites(edit: ProtectionEdit): { sheetId: string; write: SheetWrite }[] {
  const put: SheetWrite = {
    kind: 'layout',
    changes: [{ k: 'protection', id: edit.protection.id, protection: edit.protection }],
  };
  const { was } = edit;
  if (!was || (was.sheetId === edit.sheetId && was.id === edit.protection.id))
    return [{ sheetId: edit.sheetId, write: put }];
  const off: SheetWrite = {
    kind: 'layout',
    changes: [{ k: 'protection', id: was.id, protection: null }],
  };
  return [
    { sheetId: was.sheetId, write: off },
    { sheetId: edit.sheetId, write: put },
  ];
}

/** The write removing a protection. */
export const protectionRemoval = (sheetId: string, id: string) => ({
  sheetId,
  write: {
    kind: 'layout',
    changes: [{ k: 'protection', id, protection: null }],
  } satisfies SheetWrite as SheetWrite,
});
