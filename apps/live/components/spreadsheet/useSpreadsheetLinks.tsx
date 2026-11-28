'use client';

// A spreadsheet's links (docs/specs/029-sheets/inserted-objects.md "Links"): Insert Link (Insert › Link, the toolbar,
// the cell menu and Ctrl+K) opens the link editor under the active cell, an Editor's; the active cell holding a link
// shows the link card, anyone's, with Edit Link and Remove Link for an Editor on a cell's own link; Open Link and
// Alt+Enter open it, a sheet of the workbook in its tab; Get Link to This Cell copies an address opening it there.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cellKey,
  cellLinkTarget,
  cellLinkText,
  formatRanges,
  validateWrite,
  workbookRuleChecks,
  writeForRules,
  type CellLinkTarget,
  type SheetWrite,
} from '@livedoc/sheets';
import { lucideFileText, lucideLink, lucideTable } from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';
import { OfficeLinkCard } from '@/components/office/OfficeLinkCard';
import { OfficeLinkEditor, type OfficeLinkGroup } from '@/components/office/OfficeLinkEditor';
import type { SheetController } from '@/components/sheets/sheet-controller';
import { cellBox } from '@/components/sheets/sheet-geometry';
import {
  followCellLink,
  type FollowSheetLink,
} from '@/components/sheets/sheet-link-follow-context';
import { debugLog } from '@/lib/debug-log';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import type { Box } from '@/lib/office/popup-place';
import {
  cellLinkAddress,
  COPY_LINK,
  EDIT_LINK,
  GET_LINK_TO_CELL,
  INSERT_LINK,
  LINK_COPIED,
  linkSheets,
  OPEN_HYPERLINK,
  REMOVE_LINK,
  SHEET_LINK_GROUPS,
  sheetLinkAddress,
  sheetLinkEditing,
  sheetLinkOffers,
  sheetLinkWrite,
  type SheetLinkEditing,
} from '@/lib/spreadsheet/sheet-links';
import { track } from '@/lib/telemetry';
import {
  documentAddress,
  documentIdOf,
  linkTitle,
  type LinkDocument,
} from '@/lib/text-document/text-document-links';

const GLYPHS = {
  range: lucideGlyph(lucideLink, 16),
  sheets: lucideGlyph(lucideTable, 16),
  documents: lucideGlyph(lucideFileText, 16),
} as const;
const GROUPS: readonly OfficeLinkGroup[] = SHEET_LINK_GROUPS.map(([id, heading]) => ({
  id,
  heading,
  glyph: GLYPHS[id],
}));
// The card's buttons, in Google Sheets' title case.
const CARD_LABELS = { copy: 'Copy Link', edit: 'Edit Link', remove: 'Remove Link' };

/** The cell menu's Open Link, for every role (sheet.md "The cell menu"). */
export const OPEN_LINK = 'open-link';

// The active cell's box on the screen: the grid's at its zoom, the cell's within it.
function activeCellBox(c: SheetController): Box {
  const grid = c.gridEl;
  // A grid not laid out yet (as in a test) anchors at the corner.
  if (!grid) return { left: 0, top: 0, bottom: 0 };
  const rect = grid.getBoundingClientRect();
  const scale = grid.offsetWidth > 0 ? rect.width / grid.offsetWidth : 1;
  const { r, c: col } = c.selection.active;
  const box = cellBox(c.geometry, r, col, c.scroll);
  const top = rect.top + (c.geometry.headH + box.y) * scale;
  return {
    left: rect.left + (c.geometry.headW + box.x) * scale,
    top,
    bottom: top + box.h * scale,
  };
}

// More than the active cell is selected (a merge counts as its one cell).
function manySelected(c: SheetController): boolean {
  const [only, ...more] = c.selection.ranges;
  if (!only || more.length > 0) return more.length > 0;
  const { r, c: col } = c.selection.active;
  const merge = c.geometry.merges.get(`${r},${col}`);
  const cell = merge ?? { r1: r, c1: col, r2: r, c2: col };
  return only.r1 < cell.r1 || only.c1 < cell.c1 || only.r2 > cell.r2 || only.c2 > cell.c2;
}

// What the Reject rule of a typed text refuses, as typing says it; null when nothing is refused.
function ruleRefusal(c: SheetController, write: SheetWrite): string | null {
  const layout = c.sheet.layout;
  if (!layout.rules?.length) return null;
  const check = validateWrite(c.sheet, writeForRules(layout, write), {
    locale: c.locale,
    ...workbookRuleChecks(c.workbook, c.sheet.id),
  });
  return !check.ok && check.error === 'value_invalid' ? (check.line ?? null) : null;
}

export function useSpreadsheetLinks(
  c: SheetController,
  opts: {
    documentId: string;
    documents: readonly LinkDocument[];
    followSheet: FollowSheetLink | null;
  },
): { actions: OfficeActions; editor: ReactNode; card: ReactNode } {
  const { documentId, documents, followSheet } = opts;
  const [editing, setEditing] = useState<{ nonce: number; opened: SheetLinkEditing } | null>(null);
  const { r, c: col } = c.selection.active;
  const sheetId = c.sheet.id;
  const here = `${sheetId}:${r}:${col}`;
  // Whether Escape sent the active cell's card away; the active cell moving brings cards back.
  const [dismissal, setDismissal] = useState({ here, dismissed: false });
  if (dismissal.here !== here) setDismissal({ here, dismissed: false });
  const dismissed = dismissal.here === here && dismissal.dismissed;
  // The open sheet's own cell, as the grid draws it; a HYPERLINK's target from the workbook.
  const rowId = c.sheet.layout.rows[r];
  const colId = c.sheet.layout.cols[col];
  const own = (rowId && colId && c.sheet.cells.get(cellKey(rowId, colId))?.format?.ln) || null;
  const target = own !== null ? cellLinkTarget(own) : c.workbook.linkTargetOf(sheetId, r, col);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const { canShape, toast } = c;

  const open = useCallback(() => {
    if (!canShape) return;
    const place = { wb: c.workbook, sheetId, locale: c.locale };
    const opened = sheetLinkEditing(place, c.selection.active, manySelected(c));
    setEditing({ nonce: Date.now(), opened });
    debugLog(`[sheets] link editor opened sheet=${sheetId} linked=${opened.link !== ''}`);
  }, [c, canShape, sheetId]);

  const close = useCallback(() => {
    setEditing(null);
    c.focusGrid();
  }, [c]);

  const apply = useCallback(
    (text: string | null, typed: string): string | null => {
      if (!editing) return null;
      const address = sheetLinkAddress(typed, linkSheets(c.workbook), sheetId);
      if ('problem' in address) {
        debugLog(`[sheets] link refused sheet=${sheetId} problem=${address.problem}`);
        return address.problem;
      }
      const place = { wb: c.workbook, sheetId, locale: c.locale };
      const made = sheetLinkWrite(place, c.selection.active, c.selection.ranges, editing.opened, {
        text,
        href: address.href,
        shown: typed.trim(),
      });
      if (made && 'problem' in made) return made.problem;
      if (made) {
        const refused = ruleRefusal(c, made.write);
        if (refused) return refused;
        const ok = c.write(made.write, 'Format');
        if (ok && editing.opened.link === '' && address.href !== '')
          track('Spreadsheet', 'Added', 'Link');
        debugLog(`[sheets] link applied sheet=${sheetId} ok=${ok} on=${address.href !== ''}`);
      }
      close();
      return null;
    },
    [c, editing, sheetId, close],
  );

  const remove = useCallback(() => {
    const w = formatRanges(c.workbook, sheetId, c.selection.ranges, { ln: null });
    const ok = w ? c.write(w, 'Format') : false;
    debugLog(`[sheets] link removed sheet=${sheetId} ok=${ok}`);
    c.focusGrid();
  }, [c, sheetId]);

  const follow = useCallback(
    (to: CellLinkTarget) => {
      const opened = followCellLink(to, followSheet);
      debugLog(`[sheets] link opened sheet=${sheetId} kind=${to.k} opened=${opened}`);
    },
    [followSheet, sheetId],
  );

  // A link as an address to copy: a web one as it is, a sheet of the workbook as the address opening it there.
  const addressOf = useCallback(
    (to: CellLinkTarget): string | null => {
      if (to.k === 'web') return to.href;
      const tabId = c.workbook.sheet(to.sheetId)?.tabId;
      const range = to.range ?? { r1: 0, c1: 0, r2: 0, c2: 0 };
      return tabId ? cellLinkAddress(documentAddress(documentId, origin), tabId, range) : null;
    },
    [c.workbook, documentId, origin],
  );

  const copy = useCallback(
    (text: string | null) => {
      if (text === null) return;
      navigator.clipboard?.writeText(text).then(
        () => toast(LINK_COPIED),
        (error: unknown) => debugLog(`[sheets] link copy failed ${String(error)}`),
      );
    },
    [toast],
  );

  const getLinkToCell = useCallback(() => {
    const range = c.selection.ranges[c.selection.ranges.length - 1]!;
    copy(cellLinkAddress(documentAddress(documentId, origin), c.sheet.tabId, range));
  }, [c.selection.ranges, c.sheet.tabId, copy, documentId, origin]);

  const actions = useMemo((): OfficeActions => {
    const reading: OfficeActions = {
      [GET_LINK_TO_CELL]: { run: getLinkToCell },
      ...(target
        ? {
            [OPEN_LINK]: { run: () => follow(target) },
            [OPEN_HYPERLINK]: { run: () => follow(target) },
            [COPY_LINK]: { run: () => copy(addressOf(target)) },
          }
        : {}),
    };
    if (!canShape) return reading;
    return {
      ...reading,
      [INSERT_LINK]: { run: open },
      ...(own !== null ? { [EDIT_LINK]: { run: open }, [REMOVE_LINK]: { run: remove } } : {}),
    };
  }, [target, own, canShape, open, remove, follow, copy, addressOf, getLinkToCell]);

  // Escape hides the card until the active cell moves.
  const grid = c.gridEl;
  const cardShown = target !== null && !c.editing && editing === null && !dismissed;
  useEffect(() => {
    if (!grid || !cardShown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDismissal({ here, dismissed: true });
    };
    grid.addEventListener('keydown', onKeyDown);
    return () => grid.removeEventListener('keydown', onKeyDown);
  }, [grid, cardShown, here]);

  const anchor = cardShown || editing ? activeCellBox(c) : null;
  const titleOf = (id: string) => c.workbook.sheet(id)?.title;
  const card =
    cardShown && anchor && target ? (
      <OfficeLinkCard
        anchor={anchor}
        title={
          target.k === 'web'
            ? linkTitle(target.href, documents, origin)
            : cellLinkText(own ?? '', titleOf)
        }
        href={target.k === 'web' ? target.href : (addressOf(target) ?? '')}
        kind={
          target.k === 'sheet'
            ? 'sheet'
            : documentIdOf(target.href, origin) !== null
              ? 'document'
              : 'web'
        }
        labels={CARD_LABELS}
        onOpen={() => follow(target)}
        onCopy={() => copy(addressOf(target))}
        onEdit={canShape && own !== null ? open : null}
        onRemove={canShape && own !== null ? remove : null}
      />
    ) : null;

  const editor =
    editing && anchor ? (
      <OfficeLinkEditor
        key={editing.nonce}
        anchor={anchor}
        text={editing.opened.text}
        href={editing.opened.link}
        groups={GROUPS}
        offers={(typed) => sheetLinkOffers(typed, c.workbook, sheetId, documents, origin)}
        onApply={apply}
        onClose={close}
      />
    ) : null;
  return { actions, editor, card };
}
