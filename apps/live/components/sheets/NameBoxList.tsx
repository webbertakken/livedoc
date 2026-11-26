'use client';

// The name box's arrow (docs/specs/029-sheets/surface.md "Formula bar", D129): a menu of the workbook's named ranges,
// each with the range it covers (another sheet's with its name); a pick selects it, opening its sheet.
import { useState } from 'react';
import { ChevronDownIcon } from '@livedoc/ui';
import type { WorkbookNamedRange } from '@livedoc/sheets';
import { OfficeMenuPanel } from '@/components/office/OfficeMenuPanel';
import { OfficePopup } from '@/components/office/OfficePopup';
import { noShortcuts, type OfficeActions, type OfficeEntry } from '@/lib/office/office-catalogue';

const NONE_ID = 'no-named-ranges';

/** The list's items and what each runs: a name and its range, or "No named ranges" dimmed. */
export function nameBoxMenu(
  named: readonly WorkbookNamedRange[],
  goTo: (target: WorkbookNamedRange) => void,
): { entries: OfficeEntry[]; actions: OfficeActions } {
  if (!named.length)
    return {
      entries: [
        { kind: 'item', id: NONE_ID, label: 'No named ranges', level: 'view', status: 'built' },
      ],
      actions: { [NONE_ID]: { run: () => {}, disabled: true } },
    };
  return {
    // A name on two sheets (D297) is listed twice, so each item is its sheet's and its name's.
    entries: named.map((x) => ({
      kind: 'item',
      id: `name:${x.sheetId}:${x.name}`,
      label: x.name,
      level: 'view',
      status: 'built',
      note: x.text,
    })),
    actions: Object.fromEntries(
      named.map((x) => [`name:${x.sheetId}:${x.name}`, { run: () => goTo(x) }]),
    ),
  };
}

export function NameBoxList({
  names,
  goTo,
  colour,
}: {
  // Worked out only when the list opens.
  names: () => readonly WorkbookNamedRange[];
  goTo: (target: WorkbookNamedRange) => void;
  colour: string;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const menu = open ? nameBoxMenu(names(), goTo) : null;
  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        aria-label="Named Ranges"
        aria-haspopup="menu"
        aria-expanded={open}
        className="my-[2px] flex size-chip shrink-0 items-center justify-center rounded-control hover:bg-black/5 dark:hover:bg-white/10"
        style={{ color: colour }}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDownIcon size={12} />
      </button>
      {menu ? (
        <OfficePopup anchor={trigger}>
          <OfficeMenuPanel
            entries={menu.entries}
            actions={menu.actions}
            shortcutOf={noShortcuts}
            trigger={trigger}
            initialFocus="first"
            placement="popup"
            label="Named Ranges"
            onClose={() => setOpen(false)}
            onDone={() => setOpen(false)}
          />
        </OfficePopup>
      ) : null}
    </>
  );
}
