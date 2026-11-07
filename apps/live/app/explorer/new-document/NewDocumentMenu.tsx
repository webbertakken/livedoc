'use client';

// The New Document menu on a desktop (docs/specs/013-workspace/new-document-menu.md "The menu"): a command menu under
// the split button, the list of blanks on the right (straight under the button, where the pointer already is) and the
// selected blank's templates, grouped and scrolling, to its left. Hover selects a row, held while the pointer heads for the pane (useMenuAim); the
// arrow keys walk the list and the pane's grid (new-document-keys.ts); 1 to 8 make a blank from anywhere in it. The
// menu's own keys (Enter, Escape, Tab) and focus return are the shared command menu's (PortalMenu).
import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  NEW_DOCUMENT_BLANKS,
  type NewDocumentBlankId,
  type TemplateKind,
} from '@livedoc/templates';
import { lucideChevronLeft } from '@livedoc/icons/lucide';
import { lucideGlyph } from '@livedoc/ui';
import { PortalMenu } from '@/components/primitives/PortalMenu';
import { FolderOutlineIcon } from '@/components/primitives/explorer-icons';
import { paneGroupsFor } from '@/lib/new-document/pane-groups';
import { BlankGlyph } from './blank-glyphs';
import { NewDocumentPane, spotAttr } from './NewDocumentPane';
import { digitRow, moveInMenu, paneRowsFor, type MenuSpot } from './new-document-keys';
import { useMenuAim } from './useMenuAim';
import type { NewDocumentChoice } from './start-new-document';

const ChevronLeftIcon = lucideGlyph(lucideChevronLeft, 12);

// NEW_DOCUMENT_MENU_WIDTH_REM and NEW_DOCUMENT_PANE_HEIGHT_REM: the list's 14.5rem beside a
// pane of three cards a row, tall enough to show about four rows of templates at once.
const MENU_WIDTH = 'w-[40rem]';
const PANE_HEIGHT = 'h-[26rem]';

export type NewDocumentMenuProps = {
  anchor: HTMLElement | null;
  initial: NewDocumentBlankId;
  onChoose: (blank: NewDocumentBlankId, choice: NewDocumentChoice, template: TemplateKind) => void;
  onClose: () => void;
  folderLabel?: string | undefined;
  onCreateFolder?: (() => void) | undefined;
};

const listSpot = (row: number) => `list:${row}`;

export default function NewDocumentMenu({
  anchor,
  initial,
  onChoose,
  onClose,
  folderLabel,
  onCreateFolder,
}: NewDocumentMenuProps) {
  const [selected, setSelected] = useState<NewDocumentBlankId>(initial);
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const aim = useMenuAim<NewDocumentBlankId>(pane, setSelected);
  const index = NEW_DOCUMENT_BLANKS.findIndex((b) => b.id === selected);
  const blank = NEW_DOCUMENT_BLANKS[index]!;
  const groups = useMemo(
    () => new Map(NEW_DOCUMENT_BLANKS.map((b) => [b.id, paneGroupsFor(b)])),
    [],
  );
  const paneGroups = groups.get(blank.id)!;

  // A card reached from the keyboard is scrolled into the pane's view, clear of its sticky heading.
  const focusSpot = (spot: string) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-spot="${spot}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView?.({ block: 'nearest' });
  };

  // The menu opens on the last blank, its row focused once the menu is placed (PortalMenu's own first-item focus is
  // off).
  const initialRow = NEW_DOCUMENT_BLANKS.findIndex((b) => b.id === initial);
  const attachRoot = useCallback(
    (el: HTMLDivElement | null) => {
      root.current = el;
      el?.querySelector<HTMLElement>(`[data-spot="${listSpot(initialRow)}"]`)?.focus({
        preventScroll: true,
      });
    },
    [initialRow],
  );

  const where = (el: Element | null): MenuSpot | null => {
    const spot = el instanceof HTMLElement ? el.dataset.spot : undefined;
    if (!spot) return null;
    const [area, a, b] = spot.split(':');
    return area === 'list'
      ? { area: 'list', row: Number(a) }
      : { area: 'pane', row: Number(a), col: Number(b) };
  };

  // Captured ahead of the shared menu's own keys: what is moved here never reaches its typeahead or arrows.
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const digit = digitRow(event.key, NEW_DOCUMENT_BLANKS.length);
    if (digit !== null) {
      event.preventDefault();
      const b = NEW_DOCUMENT_BLANKS[digit]!;
      onChoose(b.id, 'blank', b.blank);
      return;
    }
    const at = where(document.activeElement);
    if (!at) return;
    const to = moveInMenu(event.key, at, {
      listLength: NEW_DOCUMENT_BLANKS.length,
      pane: paneRowsFor(paneGroups.map((g) => g.kinds.length)),
    });
    if (!to) return;
    event.preventDefault();
    if (to.area === 'list') {
      const row = to.row < 0 ? index : to.row;
      setSelected(NEW_DOCUMENT_BLANKS[row]!.id);
      focusSpot(listSpot(row));
    } else {
      focusSpot(spotAttr(to.row, to.col));
    }
  };

  return (
    <PortalMenu
      anchor={anchor}
      placement="below"
      onClose={onClose}
      initialFocus="none"
      label="New Document"
      frameWidth={MENU_WIDTH}
    >
      {/* The list comes first in reading order and sits on the right, under the button. */}
      <div
        ref={attachRoot}
        onKeyDownCapture={onKeyDownCapture}
        className="flex flex-row-reverse items-start"
      >
        <div className="w-[14.5rem] shrink-0 px-1.5 py-0.5">
          {NEW_DOCUMENT_BLANKS.map((b, row) => {
            const isSelected = b.id === selected;
            return (
              <button
                key={b.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-spot={listSpot(row)}
                data-selected={isSelected || undefined}
                aria-label={`${b.name}, blank`}
                aria-keyshortcuts={String(row + 1)}
                onPointerMove={(e) => aim.onRowPointerMove(b.id, e)}
                onFocus={() => setSelected(b.id)}
                onClick={() => onChoose(b.id, 'blank', b.blank)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-left outline-none transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:focus-visible:outline-brand-400 ${
                  isSelected
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <span aria-hidden className="flex w-3 justify-center text-slate-400">
                  {isSelected ? <ChevronLeftIcon /> : null}
                </span>
                <BlankGlyph id={b.id} />
                <span className="flex-1 text-[13px] font-medium">{b.name}</span>
                <span
                  aria-hidden
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] leading-none text-slate-500 dark:border-slate-600 dark:text-slate-400"
                >
                  {row + 1}
                </span>
              </button>
            );
          })}
          {onCreateFolder ? (
            <>
              <div
                role="separator"
                className="my-1 border-t border-slate-200 dark:border-slate-800"
              />
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={onCreateFolder}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-left text-[13px] text-slate-700 outline-none transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:outline-brand-400 [&_svg]:h-4 [&_svg]:w-4"
              >
                <span aria-hidden className="w-3" />
                <span aria-hidden className="text-slate-500 dark:text-slate-400">
                  <FolderOutlineIcon />
                </span>
                {folderLabel ?? 'New Folder'}
              </button>
            </>
          ) : null}
        </div>
        <div
          ref={pane}
          onPointerEnter={aim.cancel}
          className={`min-w-0 flex-1 self-stretch border-r border-slate-200 dark:border-slate-800 ${PANE_HEIGHT}`}
        >
          {/* Keyed on the blank, so another blank's templates start at their top. */}
          <NewDocumentPane
            key={blank.id}
            blank={blank}
            groups={paneGroups}
            onChoose={(template) => onChoose(blank.id, 'template', template)}
          />
        </div>
      </div>
    </PortalMenu>
  );
}
