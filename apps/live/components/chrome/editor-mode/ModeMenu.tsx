import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SWITCHABLE_EDITOR_MODES, editorModeLabel } from '@livedoc/document';
import {
  CheckIcon,
  EDITOR_MODE_ICONS,
  POPOVER_VIEWPORT_MARGIN,
  Portal,
  clampIntoRange,
  useMenu,
  type MenuInitialFocus,
} from '@livedoc/ui';
import {
  CHROME_MENU_MARK,
  CHROME_MENU_MARK_CURRENT,
  CHROME_MENU_ROW,
  CHROME_MENU_ROW_CURRENT,
  CHROME_MENU_ROW_IDLE,
  CHROME_MENU_SURFACE,
} from '../chrome-menu-row';
import type { EditorModeSwitchProps } from './editor-mode-copy';

type Mode = EditorModeSwitchProps['mode'];

// The mode menu's measures (docs/specs/007-editor/editor-modes.md "The mode switch", mock-up B): a 220px panel, or the
// chip's width when that is wider, of 36px rows.
export const MODE_MENU_WIDTH = 220;

// The mode menu (docs/specs/007-editor/editor-modes.md "The mode switch"): a plain dropdown, styled as the toolbar
// group's menus. One list, a row per mode in the order Sketch, Structured, Pages: the mode's mark, its name and, on
// the current mode, a check. The rows are the menu's `menuitemradio` items; choosing is a click, or Enter or Space on
// the focused row (useMenu), and closes the menu.
//
// Opened by ModeMenuChip, in the top chrome and on every start panel's rail, so both show the same menu.
//
// The top chrome's menu (not `fill`) mounts in a Portal, fixed below the chip and kept POPOVER_VIEWPORT_MARGIN inside
// the viewport: inside the menu card it would sit under the canvas's own overlays (an empty tab's tray) and run off a
// phone's right edge. It is placed once it has a size, and again on a resize; hidden until then so it never flashes.
// A Portal is not scaled by the toolbar's UI scale, so it needs no zoom undoing. `data-mode-menu` lets the chip's
// outside-press check count a press on the menu as inside.
export function ModeMenu({
  mode,
  chip,
  initialFocus,
  hostZoom,
  onChange,
  onClose,
  fill = false,
}: {
  mode: Mode;
  chip: HTMLElement | null;
  initialFocus: MenuInitialFocus;
  hostZoom: number;
  onChange: EditorModeSwitchProps['onChange'];
  onClose: () => void;
  // A start panel's labelled switch: the menu hangs from the rail's row, spanning it on a phone.
  fill?: boolean;
}) {
  const { attach, surfaceProps } = useMenu({
    onClose,
    trigger: chip,
    initialFocus,
    label: 'Editor mode',
  });
  const choose = (option: Mode) => {
    onClose();
    if (option !== mode) onChange(option);
  };

  const panel = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (fill || !chip) return;
    const measure = () => {
      const rect = chip.getBoundingClientRect();
      const width = panel.current?.offsetWidth ?? 0;
      const max = window.innerWidth - width - POPOVER_VIEWPORT_MARGIN;
      setPlace({
        top: rect.bottom + 6,
        left: clampIntoRange(rect.left, POPOVER_VIEWPORT_MARGIN, max),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fill, chip]);

  const floating = !fill;
  const style: CSSProperties = {
    minWidth: MODE_MENU_WIDTH,
    ...(floating
      ? place
        ? { top: place.top, left: place.left }
        : { top: 0, left: 0, visibility: 'hidden' as const }
      : hostZoom === 1
        ? {}
        : { zoom: 1 / hostZoom }),
  };
  const position = floating
    ? 'fixed z-(--z-popover) max-w-[calc(100vw-1rem)]'
    : 'absolute left-0 top-full z-(--z-popover) mt-1.5 max-w-[calc(100vw-2rem)] max-sm:inset-x-2';

  const menu = (
    <div
      ref={(node) => {
        panel.current = node;
        attach(node);
      }}
      {...surfaceProps}
      data-tour-id="editor-mode-menu"
      data-mode-menu=""
      style={style}
      className={`${position} ${CHROME_MENU_SURFACE}`}
    >
      {SWITCHABLE_EDITOR_MODES.map((option) => {
        const checked = option === mode;
        const RowIcon = EDITOR_MODE_ICONS[option];
        return (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            data-mode-row={option}
            tabIndex={-1}
            onClick={() => choose(option)}
            className={`${CHROME_MENU_ROW} ${checked ? CHROME_MENU_ROW_CURRENT : CHROME_MENU_ROW_IDLE}`}
          >
            <RowIcon
              size={16}
              aria-hidden
              className={checked ? CHROME_MENU_MARK_CURRENT : CHROME_MENU_MARK}
            />
            <span className="text-optical-line min-w-0 flex-1 truncate">
              {editorModeLabel(option)}
            </span>
            {checked ? (
              <CheckIcon
                aria-hidden
                data-mode-check=""
                className="size-icon-row shrink-0 text-brand-700 dark:text-sky-300"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
  return floating ? <Portal>{menu}</Portal> : menu;
}
