import { useRef, useState } from 'react';
import { editorModeLabel } from '@livedoc/document';
import { ChevronDownIcon, useClickOutside, useMenuButton, EDITOR_MODE_ICONS } from '@livedoc/ui';
import { TOOLBAR_TRIGGER_TONE } from '@/components/palette/PaletteDropdown';
import {
  EDITOR_MODE_KEYSHORTCUT,
  MODE_SWITCH_FOCUS,
  type EditorModeSwitchProps,
} from './editor-mode-copy';
import { ModeMenu } from './ModeMenu';

// The mode switch (docs/specs/007-editor/editor-modes.md "The mode switch"): a dropdown chip showing the current
// mode's glyph, its name and a chevron, that opens the mode menu (ModeMenu) DOWNWARD, hanging from the chip's left edge:
// a plain list of the three modes. No hover card, which would cover the menu. The chip
// wears the strip's faint dropdown tint (docs/specs/007-editor/toolbar-layout.md "Look"), so it
// reads as a menu.
//
// Menu button pattern (docs/specs/004-interface-design/menus.md): the chip is a menu button, the rows
// are `menuitemradio`, and the shared hooks give it the menu keyboard: opening focuses the checked
// row, choosing or Escape returns focus to the chip, Tab closes it. An outside press closes it.
//
// Two forms: `compact`, the top chrome's chip beside the menu button (EditorModeSwitch), named "Editor mode", its
// name dropped where `iconOnly` (a phone); else a start panel's full-bleed rail row, named "Tab mode", so the two
// never share a name while both show.
export function ModeMenuChip({
  mode,
  onChange,
  compact = false,
  iconOnly = false,
}: EditorModeSwitchProps & { compact?: boolean; iconOnly?: boolean }) {
  const {
    open,
    close,
    toggle,
    initialFocus,
    trigger: chip,
    onTriggerKeyDown,
    setTrigger,
  } = useMenuButton();
  const root = useRef<HTMLDivElement>(null);
  const Icon = EDITOR_MODE_ICONS[mode];
  const label = editorModeLabel(mode);

  // The zoom the chip's host draws at (the toolbar or panel UI scale, docs/specs/007-editor/ui-scale.md),
  // read when the menu opens; the menu undoes it, so it opens at design size like every menu
  // opened from a scaled surface.
  const [hostZoom, setHostZoom] = useState(1);
  const readZoom = () => {
    if (chip) setHostZoom(effectiveZoom(chip));
  };

  // The top chrome's menu is portalled out of `root`; a press on it is still inside.
  useClickOutside(root, close, open, '[data-mode-menu]');

  return (
    <div ref={root} className={compact ? 'relative' : 'relative w-full'}>
      {/* No hover card: it would sit over the menu the chip opens. The chip keeps its accessible name and says
          Shift+D (aria-keyshortcuts). */}
      <button
        ref={setTrigger}
        type="button"
        // What the Leave Pages confirmation hangs from (LeavePagesConfirm).
        data-mode-switch=""
        aria-haspopup="menu"
        aria-expanded={open}
        // The rail's is named for the tab it sets; the top chrome's for the editor.
        aria-label={`${compact ? 'Editor' : 'Tab'} mode: ${label}`}
        aria-keyshortcuts={EDITOR_MODE_KEYSHORTCUT}
        onClick={() => {
          readZoom();
          toggle();
        }}
        onKeyDown={(event) => {
          if (!open) readZoom();
          onTriggerKeyDown(event);
        }}
        // Compact: a toolbar-height chip in the menu card. Else a full-bleed row filling the edge it sits on (a start
        // panel's rail top): square, tall, its focus ring drawn inside so the panel's edge never clips it.
        className={`flex items-center transition-colors ${
          compact
            ? `h-row tool-line:h-field justify-start gap-2 rounded-control px-2 text-body ${MODE_SWITCH_FOCUS}`
            : 'h-12 w-full justify-start gap-3 rounded-none px-6 text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:focus-visible:outline-brand-400'
        } ${TOOLBAR_TRIGGER_TONE}`}
      >
        <Icon aria-hidden />
        {/* The top chrome's chip names the mode from 1280px wide; narrower it is the mark alone (its accessible name
            still says the mode), so the top line keeps its room for the Palette strip
            (docs/specs/007-editor/editor-modes.md "The mode switch"). */}
        {iconOnly ? null : (
          <span className={`text-optical-line flex-1 text-left ${compact ? 'max-xl:hidden' : ''}`}>
            {label}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden
          className={`transition-transform duration-micro motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open ? (
        <ModeMenu
          mode={mode}
          chip={chip}
          initialFocus={initialFocus}
          hostZoom={hostZoom}
          onChange={onChange}
          onClose={close}
          // The rail's menu hangs from its row; the top chrome's floats, clamped to the viewport.
          fill={!compact}
        />
      ) : null}
    </div>
  );
}

// The effective CSS zoom an element draws at (its own and its ancestors'): `currentCSSZoom` where
// the browser has it, else its screen width over its layout width. 1 when it cannot be read.
function effectiveZoom(el: HTMLElement): number {
  const current = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom;
  if (typeof current === 'number' && current > 0) return current;
  const width = el.offsetWidth;
  const zoom = width > 0 ? el.getBoundingClientRect().width / width : 1;
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}
