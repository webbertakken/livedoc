'use client';

// The name box's arrow (docs/specs/029-sheets/surface.md "Formula bar", D129): a menu of the sheet's named ranges,
// each with the range it covers; a pick selects it. A sheet's names are its own, so the list is the open sheet's.
import { useState } from 'react';
import { ChevronDownIcon } from '@livedoc/ui';
import { formatRange, posRangeOf, type GridRange, type SheetLayout } from '@livedoc/sheets';
import { OfficeMenuPanel } from '@/components/office/OfficeMenuPanel';
import { OfficePopup } from '@/components/office/OfficePopup';
import { noShortcuts, type OfficeActions, type OfficeEntry } from '@/lib/office/office-catalogue';

const NONE_ID = 'no-named-ranges';

/** The list's items and what each runs: a name and its range, or "No named ranges" dimmed. */
export function nameBoxMenu(
  layout: SheetLayout,
  goTo: (range: GridRange) => void,
): { entries: OfficeEntry[]; actions: OfficeActions } {
  const named = (layout.names ?? []).flatMap((x) => {
    const at = posRangeOf(layout, x);
    return at ? [{ name: x.name, at }] : [];
  });
  if (!named.length)
    return {
      entries: [
        { kind: 'item', id: NONE_ID, label: 'No named ranges', level: 'view', status: 'built' },
      ],
      actions: { [NONE_ID]: { run: () => {}, disabled: true } },
    };
  return {
    entries: named.map(({ name, at }) => ({
      kind: 'item',
      id: `name:${name}`,
      label: name,
      level: 'view',
      status: 'built',
      note: formatRange(at),
    })),
    actions: Object.fromEntries(
      named.map(({ name, at }) => [`name:${name}`, { run: () => goTo(at) }]),
    ),
  };
}

export function NameBoxList({
  layout,
  goTo,
  colour,
}: {
  layout: SheetLayout;
  goTo: (range: GridRange) => void;
  colour: string;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const menu = open ? nameBoxMenu(layout, goTo) : null;
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
