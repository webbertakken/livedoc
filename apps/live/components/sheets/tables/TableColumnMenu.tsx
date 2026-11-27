'use client';

// A table column's menu (docs/specs/029-sheets/data-tools.md "Tables" "Column menu"), under the column's name: Edit
// Column Type (the types as a list, the column's own ticked; Dropdown opens the dropdown rule's options form), Sort A
// to Z and Z to A (the data rows), Insert 1 Column Left and Right, and Delete Column. Every item is an Editor's,
// dimmed for anyone else, as the table menu's are.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@livedoc/ui';
import { tableColumnOptions, type SheetTable, type TableColumnType } from '@livedoc/sheets';
import { ContextMenu, ContextMenuDivider } from '@/components/palette/ContextMenu';
import { MenuActionRow, MenuHeader } from '@/components/primitives/PortalMenu';
import { debugLog } from '@/lib/debug-log';
import { Glyph } from '../SheetCellMenu';
import { useSheetController } from '../sheet-controller';
import { useSheetActions } from '../useSheetActions';
import { SheetDropdownOptions } from '../rules/SheetDropdownOptions';
import { dropdownOptionsOf, nextKey, type Option } from '../rules/validation-draft';
import { COLUMN_TYPE_CHOICES, COLUMN_TYPE_LABELS } from './table-column-types';

type View = 'main' | 'types' | 'dropdown';

export function TableColumnMenu({
  table,
  colId,
  name,
  position,
  onClose,
}: {
  table: SheetTable;
  colId: string;
  // The column's name (its header's text, or Column N).
  name: string;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const c = useSheetController();
  const actions = useSheetActions();
  const editor = c.canShape;
  const [view, setView] = useState<View>('main');
  const [opts, setOpts] = useState<Option[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  // A view changed by the keyboard keeps the keys in the menu: its first item takes the focus.
  useEffect(() => {
    if (view !== 'main') body.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, [view]);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const current = table.types?.[colId] ?? 'none';
  const choose = (type: TableColumnType | 'none') => {
    if (type !== 'dropdown')
      return run(() => actions.setColumnType(table.id, colId, type === 'none' ? null : type))();
    const from = tableColumnOptions(c.workbook, c.sheet.id, table.id, colId);
    setOpts(from.map((o) => ({ key: nextKey(), v: o.v, ...(o.c ? { c: o.c } : {}) })));
    setWhy(null);
    setView('dropdown');
  };
  const done = () => {
    const made = dropdownOptionsOf(opts);
    if (!made.ok) {
      debugLog('[sheet] table refused', { reason: 'options' });
      return setWhy(made.why);
    }
    onClose();
    actions.setColumnType(table.id, colId, 'dropdown', made.opts);
  };
  return (
    <ContextMenu position={position} label={`${name} column menu`} onClose={onClose}>
      <div ref={body}>
        <MenuHeader title={view === 'main' ? name : `${name}: Edit Column Type`} />
        {view === 'main' ? (
          <>
            <MenuActionRow
              label="Edit Column Type"
              icon={<Glyph t="▤" />}
              disabled={!editor}
              onClick={() => setView('types')}
            />
            <ContextMenuDivider />
            <MenuActionRow
              label="Sort A to Z"
              icon={<Glyph t="↓" />}
              disabled={!editor}
              onClick={run(() => actions.sortTableColumn(table.id, colId, true))}
            />
            <MenuActionRow
              label="Sort Z to A"
              icon={<Glyph t="↑" />}
              disabled={!editor}
              onClick={run(() => actions.sortTableColumn(table.id, colId, false))}
            />
            <ContextMenuDivider />
            <MenuActionRow
              label="Insert 1 Column Left"
              icon={<Glyph t="←" />}
              disabled={!editor}
              onClick={run(() => actions.insertTableColumn(table.id, colId, 'before'))}
            />
            <MenuActionRow
              label="Insert 1 Column Right"
              icon={<Glyph t="→" />}
              disabled={!editor}
              onClick={run(() => actions.insertTableColumn(table.id, colId, 'after'))}
            />
            <MenuActionRow
              label="Delete Column"
              icon={<Glyph t="−" />}
              disabled={!editor}
              onClick={run(() => actions.deleteTableColumn(colId))}
            />
          </>
        ) : null}
        {view === 'types' ? (
          <div role="group" aria-label="Column types">
            <MenuActionRow label="Back" icon={<Glyph t="‹" />} onClick={() => setView('main')} />
            <ContextMenuDivider />
            {COLUMN_TYPE_CHOICES.map((t) => (
              <MenuActionRow
                key={t}
                label={COLUMN_TYPE_LABELS[t]}
                icon={t === current ? <Glyph t="✓" /> : <span aria-hidden />}
                onClick={() => choose(t)}
              />
            ))}
          </div>
        ) : null}
        {view === 'dropdown' ? (
          <div className="flex w-80 flex-col gap-2 px-3 pb-2">
            <SheetDropdownOptions
              opts={opts}
              onChange={(next) => {
                setWhy(null);
                setOpts(next);
              }}
            />
            {why ? (
              <span role="alert" className="text-supporting text-red-700 dark:text-red-300">
                {why}
              </span>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setView('types')}>
                Cancel
              </Button>
              <Button size="sm" onClick={done}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </ContextMenu>
  );
}
