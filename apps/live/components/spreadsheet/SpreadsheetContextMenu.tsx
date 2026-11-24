'use client';

// The grid's context menus on a spreadsheet (docs/specs/029-sheets/surface.md "Context menus"): the place's items,
// the menus' own, drawn by the shell's context menu. What the session's role may not use is not drawn; what is not
// built yet stays dimmed; a contextual item (Open Link) only while it can run.
import { useEffect, useMemo } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { OfficeContextMenu } from '@/components/office/OfficeContextMenu';
import {
  contextualEntries,
  visibleMenus,
  type OfficeActions,
  type OfficeEntry,
} from '@/lib/office/office-catalogue';
import type { Point } from '@/lib/office/context-menu-place';
import { currentOfficePlatform } from '@/lib/office/office-platform';
import { shortcutTextOf } from '@/lib/office/shortcut-notation';
import {
  SPREADSHEET_CONTEXT_MENUS,
  type SheetContextPlace,
} from '@/lib/spreadsheet/spreadsheet-context-menus';
import { SPREADSHEET_SHORTCUTS } from '@/lib/spreadsheet/spreadsheet-shortcuts';
import { debugLog } from '@/lib/debug-log';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { SheetMenus } from '@/components/sheets/SheetMenus';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { spreadsheetLevel } from './SpreadsheetTitleRow';
import { track } from '@/lib/telemetry';

/** What the session sees of a place's menu as it opens: its level's items, bound, contextual ones while they run. */
export function contextMenuEntries(
  place: SheetContextPlace,
  level: AccessLevel,
  actions: OfficeActions,
): OfficeEntry[] {
  const menu = { id: place, label: place, entries: SPREADSHEET_CONTEXT_MENUS[place] };
  const shown = visibleMenus([menu], level, actions).flatMap((m) => m.entries);
  return contextualEntries(shown, actions);
}

export function SpreadsheetContextMenu({
  place,
  at,
  level,
  actions,
  onClose,
}: {
  place: SheetContextPlace;
  at: Point;
  level: AccessLevel;
  actions: OfficeActions;
  onClose: () => void;
}) {
  const entries = useMemo(() => contextMenuEntries(place, level, actions), [place, level, actions]);
  const shortcutOf = useMemo(
    () => shortcutTextOf(SPREADSHEET_SHORTCUTS, currentOfficePlatform()),
    [],
  );
  useEffect(() => {
    track('UI', 'Opened', 'SpreadsheetContextMenu');
    debugLog('[workbook] context menu', { place });
  }, [place]);
  return (
    <OfficeContextMenu
      entries={entries}
      at={at}
      actions={actions}
      shortcutOf={shortcutOf}
      onClose={onClose}
    />
  );
}

/** The open sheet's menus with the spreadsheet's own for a cell and a header; the grid's bindings run their items. */
export function SpreadsheetGridMenus({
  actions,
  bound,
}: {
  actions: SheetActions;
  bound: OfficeActions;
}) {
  const c = useSheetController();
  const level = spreadsheetLevel(c.canEdit, c.canShape);
  return (
    <SheetMenus
      actions={actions}
      contextMenu={(menu, onClose) => (
        <SpreadsheetContextMenu
          place={menu.kind === 'cell' ? 'cell' : menu.axis === 'r' ? 'row' : 'column'}
          at={{ x: menu.x, y: menu.y }}
          level={level}
          actions={bound}
          onClose={onClose}
        />
      )}
    />
  );
}
