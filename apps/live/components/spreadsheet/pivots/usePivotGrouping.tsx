'use client';

// Grouping a pivot table's items from the grid's context menu (docs/specs/029-sheets/pivot-tables.md "Grouping in the
// grid", D621): the bindings the active cell and the selection offer an Editor, each a whole new pivot table written
// as the editor's changes are (one undo step), and Create Pivot Group Rule's dialog.
import { useState, type ReactNode } from 'react';
import {
  PIVOT_DATE_RULES,
  pivotCustomGroup,
  pivotSetGrouping,
  pivotUngroupItem,
  type PivotItemPlace,
  type SheetPivot,
} from '@livedoc/sheets';
import type { SheetController } from '@/components/sheets/sheet-controller';
import type { OfficeAction } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';
import {
  pivotDateGroupId,
  pivotGroupingMenu,
  pivotGroupRuleStart,
  type PivotGroupRuleFields,
} from '@/lib/spreadsheet/pivot-grouping-menu';
import { PivotGroupRuleDialog } from './PivotGroupRuleDialog';

type RuleOpen = { pivotId: string; item: PivotItemPlace; start: PivotGroupRuleFields };

export function usePivotGrouping(
  c: Pick<SheetController, 'workbook' | 'sheet' | 'selection' | 'canShape'>,
  // A pivot table set whole, one undo step (useSpreadsheetPivots' change).
  change: (next: SheetPivot) => void,
): { actions: Record<string, OfficeAction>; dialog: ReactNode } {
  const [rule, setRule] = useState<RuleOpen | null>(null);
  const { sheet } = c;
  const set = (next: SheetPivot, what: string) => {
    debugLog(`[sheet-pivots] grouping sheet=${sheet.id} pivot=${next.id} ${what}`);
    change(next);
  };
  const actions: Record<string, OfficeAction> = {};
  const menu = c.canShape ? pivotGroupingMenu(c.workbook, sheet, c.selection) : null;
  if (menu) {
    const { pivot, item, picked } = menu;
    const { axis, depth } = item;
    if (menu.dateGroup)
      for (const r of PIVOT_DATE_RULES)
        actions[pivotDateGroupId(r)] = {
          run: () => set(pivotSetGrouping(pivot, axis, depth, { k: 'date', rule: r }), `date=${r}`),
        };
    if (menu.groupRule)
      actions['pivot-group-rule'] = {
        run: () => setRule({ pivotId: pivot.id, item, start: pivotGroupRuleStart(item) }),
      };
    if (picked)
      actions['pivot-group'] = {
        run: () =>
          set(pivotCustomGroup(pivot, axis, depth, picked), `custom items=${picked.length}`),
      };
    if (menu.ungroup)
      actions['pivot-ungroup'] = {
        run: () => set(pivotUngroupItem(pivot, axis, depth, item), `ungroup made=${item.made}`),
      };
  }
  const dialog =
    rule === null ? null : (
      <PivotGroupRuleDialog
        start={rule.start}
        onClose={() => setRule(null)}
        onOk={(grouping) => {
          setRule(null);
          // The pivot table as it stands now: it may have changed, or gone, while the dialog was open.
          const pivot = (sheet.layout.objects ?? []).find(
            (x): x is SheetPivot => x.kind === 'pivot' && x.id === rule.pivotId,
          );
          if (!pivot) {
            debugLog(`[sheet-pivots] grouping sheet=${sheet.id} pivot=${rule.pivotId} gone`);
            return;
          }
          set(
            pivotSetGrouping(pivot, rule.item.axis, rule.item.depth, grouping),
            `interval size=${grouping.size}`,
          );
        }}
      />
    );
  return { actions, dialog };
}
