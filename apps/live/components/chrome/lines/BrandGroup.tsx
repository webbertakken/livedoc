'use client';

import { useUiScale } from '@/components/providers/ui-scale';
import { uiScaleStyle } from '@/lib/ui-scale';
import { EditorModeSwitch } from '@/components/chrome/editor-mode/EditorModeSwitch';
import { ToolbarExplorerButton } from '@/components/chrome/ToolbarExplorerButton';
import { ToolbarGroup, ToolbarPart } from '@/components/chrome/ToolbarGroup';
import { PHONE_TOOLBAR_ITEMS } from '@/components/chrome/phone-toolbar-items';
import { BrandBack, useBackTarget, type BackTarget } from './BrandBack';

// The brand group, the top line's left (docs/specs/007-editor/toolbar-layout.md "The top line"): Back (caret and
// mark), a divider, the menu button and the editor mode switch (named on a computer, its icon alone on a phone; it
// renders nothing where no switch is offered: a Participant, a Viewer, a locked tab, an event-storming board).
// `explorer` is null where the menu button is not offered (a workbench, a phone held sideways).
//
// `data-toolbar-menu` is what the strip measures to keep clear of it (lib/top-line-clearance) and what a maximised
// board's insets read (canvas-layer-insets), so whatever the group holds, the strip makes room for it.
// `data-dock-button`: MovablePanel's outside-click check skips it, as the menu button toggles a dock panel.
// `data-floating-panel`: chrome, not canvas, so the canvas's capture-phase gestures skip a press here (a press with a
// Draw pen in hand started a stroke).
export function BrandGroup({
  back,
  explorer,
  accent,
  phone = false,
}: {
  // Where Back goes; by default, where this page is (useBackTarget).
  back?: BackTarget;
  explorer: { open: boolean; onToggle: (button: HTMLElement) => void } | null;
  accent?: string;
  phone?: boolean;
}) {
  // Drawn at the UI scale (docs/specs/007-editor/ui-scale.md); the top line (TopLine) places it.
  const scale = useUiScale('toolbar');
  const pageBack = useBackTarget();
  return (
    <ToolbarGroup
      data-dock-button=""
      data-floating-panel=""
      data-tour-id="dock-explorer"
      data-toolbar-menu=""
      data-region="header"
      style={scale === 1 ? undefined : uiScaleStyle(scale)}
      className={`pointer-events-auto relative shrink-0 ${PHONE_TOOLBAR_ITEMS}`}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <ToolbarPart>
        <BrandBack target={back ?? pageBack} accent={accent} />
      </ToolbarPart>
      <ToolbarPart>
        {explorer ? (
          <ToolbarExplorerButton open={explorer.open} onToggle={explorer.onToggle} />
        ) : null}
        <EditorModeSwitch iconOnly={phone} />
      </ToolbarPart>
    </ToolbarGroup>
  );
}
