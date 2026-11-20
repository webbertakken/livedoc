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
import { lucideFileText } from '@livedoc/icons/lucide';
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

/** The add menu's rows, and the tab list footer's: Text document only where it is offered. */
export function addTabRows(offerTextDocument: boolean): typeof ADD_TAB_ROWS {
  return offerTextDocument ? [...ADD_TAB_ROWS, TEXT_DOCUMENT_ROW] : ADD_TAB_ROWS;
}

const TEXT_DOCUMENT_MARK = lucideGlyph(lucideFileText, 16);

/** A row's mark: the Tab row the mark of the mode its tab opens in, a Plan row its kind's glyph. */
export function addTabMark(
  choice: AddTabChoice,
  tabMode: SwitchableEditorMode,
): ComponentType<IconProps> {
  if (choice === 'text-document') return TEXT_DOCUMENT_MARK;
  return choice === 'tab' ? EDITOR_MODE_ICONS[tabMode] : PLAN_KIND_ICONS[choice];
}

// The document group's + (docs/specs/007-editor/toolbar-layout.md "The bottom line"): a menu button named "Add tab"
// opening the add menu, which hangs above it (the bottom line), its right edge on the button's, kept inside the
// viewport. Tab, then Board, Sheet and Dashboard, each its mark and name; choosing adds it and closes the menu. The
// same plain look and keyboard as the mode menu (useMenu). Shown only to someone who may add tabs (the caller gates).
export function AddTabMenu({
  onAdd,
  tabMode,
  offerTextDocument = false,
}: {
  onAdd: (choice: AddTabChoice) => void;
  // The mode a Tab added now opens in (newTabOpening), whose mark the Tab row wears.
  tabMode: SwitchableEditorMode;
  // Whether the document can hold a text document tab (addTabRows).
  offerTextDocument?: boolean;
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
          offerTextDocument={offerTextDocument}
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
  offerTextDocument,
  onClose,
  onAdd,
}: {
  trigger: HTMLElement | null;
  initialFocus: MenuInitialFocus;
  tabMode: SwitchableEditorMode;
  offerTextDocument: boolean;
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
        {addTabRows(offerTextDocument).map(({ choice, label }) => {
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
