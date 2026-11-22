'use client';

import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import {
  EDITOR_MODE_ICONS,
  lucideGlyph,
  POPOVER_VIEWPORT_MARGIN,
  Portal,
  clampIntoRange,
  useClickOutside,
  useMenu,
  useMenuButton,
  type IconProps,
  type MenuInitialFocus,
} from '@livedoc/ui';
import type { SwitchableEditorMode } from '@livedoc/document';
import { lucideFile, lucideFileText } from '@livedoc/icons/lucide';
import { TOOLBAR_ICON_BUTTON } from '@/components/chrome/toolbar-surface';
import { PLAN_KIND_ICONS } from '@/components/chrome/editor-mode/TabModeIcon';
import {
  CHROME_MENU_MARK,
  CHROME_MENU_ROW,
  CHROME_MENU_ROW_IDLE,
  CHROME_MENU_SURFACE,
} from '@/components/chrome/chrome-menu-row';
import type { AddTabChoice } from '@/lib/new-tab-seed';
import { track } from '@/lib/telemetry';

// The add menu's rows, in order (docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab"), with the words
// the tab list's footer shows for each.
export const ADD_TAB_ROWS: readonly { choice: AddTabChoice; label: string; footer: string }[] = [
  { choice: 'tab', label: 'Tab', footer: 'New Tab' },
  { choice: 'board', label: 'Board', footer: 'New Board' },
  { choice: 'sheet', label: 'Sheet', footer: 'New Sheet' },
  { choice: 'dashboard', label: 'Dashboard', footer: 'New Dashboard' },
];

// A text document tab, after the Plan rows, where the document can hold one: stored on LiveDoc, as This Browser does not
// hold a text document yet (docs/specs/006-document/kinds-outside-the-canvas.md "The tab strip").
const TEXT_DOCUMENT_ROW = {
  choice: 'text-document',
  label: 'Text document',
  footer: 'New Text Document',
} as const;

// A PDF tab from the computer, after Text document, where the document can hold one: stored on LiveDoc, on a host
// that stores files (docs/specs/035-pdf-documents/pdf-document.md "A PDF tab from a file").
const PDF_ROW = { choice: 'pdf', label: 'PDF from a file', footer: 'New PDF From a File' } as const;

/** The tabs outside the canvas the add menu offers in this document. */
export type AddTabOffers = { readonly textDocument: boolean; readonly pdf: boolean };

export const NO_ADD_TAB_OFFERS: AddTabOffers = { textDocument: false, pdf: false };

/** The add menu's rows, and the tab list footer's: Text document and PDF from a file only where offered. */
export function addTabRows(offers: AddTabOffers): typeof ADD_TAB_ROWS {
  return [
    ...ADD_TAB_ROWS,
    ...(offers.textDocument ? [TEXT_DOCUMENT_ROW] : []),
    ...(offers.pdf ? [PDF_ROW] : []),
  ];
}

const TEXT_DOCUMENT_MARK = lucideGlyph(lucideFileText, 16);
// The tab pill's own for a PDF tab (TabModeIcon).
const PDF_MARK = lucideGlyph(lucideFile, 16);

/** A row's mark: the Tab row the mark of the mode its tab opens in, a Plan row its kind's glyph. */
export function addTabMark(
  choice: AddTabChoice,
  tabMode: SwitchableEditorMode,
): ComponentType<IconProps> {
  if (choice === 'text-document') return TEXT_DOCUMENT_MARK;
  if (choice === 'pdf') return PDF_MARK;
  return choice === 'tab' ? EDITOR_MODE_ICONS[tabMode] : PLAN_KIND_ICONS[choice];
}

// The document group's + (docs/specs/007-editor/toolbar-layout.md "The bottom line"): a menu button named "Add tab"
// opening the add menu, which hangs above it (the bottom line), its right edge on the button's, kept inside the
// viewport. Tab, then Board, Sheet and Dashboard, then what is offered outside the canvas, each its mark and name;
// choosing adds it and closes the menu. The same plain look and keyboard as the mode menu (useMenu). Shown only to someone who may add tabs (the caller gates).
export function AddTabMenu({
  onAdd,
  tabMode,
  offers = NO_ADD_TAB_OFFERS,
}: {
  onAdd: (choice: AddTabChoice) => void;
  // The mode a Tab added now opens in (newTabOpening), whose mark the Tab row wears.
  tabMode: SwitchableEditorMode;
  // The tabs outside the canvas this document can take (addTabRows).
  offers?: AddTabOffers;
}) {
  const { open, close, toggle, initialFocus, trigger, onTriggerKeyDown, setTrigger } =
    useMenuButton();
  const root = useRef<HTMLDivElement>(null);
  useClickOutside(root, close, open, '[data-add-tab-menu]');
  return (
    <div ref={root} className="relative flex">
      <button
        ref={setTrigger}
        type="button"
        aria-label="Add tab"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour-id="add-tab"
        onClick={() => {
          if (!open) track('UI', 'Opened', 'AddTabMenu');
          toggle();
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp'))
            track('UI', 'Opened', 'AddTabMenu');
          onTriggerKeyDown(event);
        }}
        className={`${TOOLBAR_ICON_BUTTON} text-lg leading-none`}
      >
        +
      </button>
      {open ? (
        <AddTabPanel
          trigger={trigger}
          initialFocus={initialFocus}
          tabMode={tabMode}
          offers={offers}
          onClose={close}
          onAdd={onAdd}
        />
      ) : null}
    </div>
  );
}

function AddTabPanel({
  trigger,
  initialFocus,
  tabMode,
  offers,
  onClose,
  onAdd,
}: {
  trigger: HTMLElement | null;
  initialFocus: MenuInitialFocus;
  tabMode: SwitchableEditorMode;
  offers: AddTabOffers;
  onClose: () => void;
  onAdd: (choice: AddTabChoice) => void;
}) {
  const { attach, surfaceProps } = useMenu({
    onClose,
    trigger,
    initialFocus: initialFocus === 'checked' ? 'first' : initialFocus,
    label: 'Add tab',
  });
  const panel = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ bottom: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!trigger) return;
    const measure = () => {
      const rect = trigger.getBoundingClientRect();
      const width = panel.current?.offsetWidth ?? 0;
      const max = window.innerWidth - width - POPOVER_VIEWPORT_MARGIN;
      setPlace({
        bottom: window.innerHeight - rect.top + 6,
        left: clampIntoRange(rect.right - width, POPOVER_VIEWPORT_MARGIN, max),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [trigger]);
  const choose = (choice: AddTabChoice) => {
    onClose();
    onAdd(choice);
  };
  return (
    <Portal>
      <div
        ref={(node) => {
          panel.current = node;
          attach(node);
        }}
        {...surfaceProps}
        data-add-tab-menu=""
        style={
          place
            ? { bottom: place.bottom, left: place.left }
            : { bottom: 0, left: 0, visibility: 'hidden' }
        }
        className={`fixed z-(--z-popover) min-w-44 max-w-[calc(100vw-1rem)] ${CHROME_MENU_SURFACE}`}
      >
        {addTabRows(offers).map(({ choice, label }) => {
          const Mark = addTabMark(choice, tabMode);
          return (
            <button
              key={choice}
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-add-tab-row={choice}
              {...(choice === 'tab' ? { 'data-opens-in': tabMode } : {})}
              onClick={() => choose(choice)}
              className={`${CHROME_MENU_ROW} ${CHROME_MENU_ROW_IDLE}`}
            >
              <Mark size={16} aria-hidden className={CHROME_MENU_MARK} />
              <span className="text-optical-line min-w-0 flex-1 truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </Portal>
  );
}
