'use client';

// The office shell's panels for one kind (docs/specs/004-interface-design/office-shell.md "Side panels"): which are open,
// remembered per kind, the right panel's width, remembered for every kind, and the menu items that open them.
import { useCallback, useMemo, useState } from 'react';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import type { OfficeActions } from './office-catalogue';
import {
  readOfficePanelWidth,
  readOpenPanels,
  writeOfficePanelWidth,
  writeOpenPanels,
} from './office-panel-store';
import { OpenPanels, type OfficePanelSide, type OfficePanelSpec } from './office-panels';

export type OfficePanelsState = {
  open: OpenPanels;
  // Binds each panel's menu item: chosen, it opens or closes the panel; checked while it is open.
  actions: OfficeActions;
  close: (side: OfficePanelSide) => void;
  // Puts focus in a panel, opening it first where it is closed (a shortcut that goes to a panel).
  reveal: (panel: OfficePanelSpec) => void;
  // Bumped each time a person opens a panel, so it takes focus.
  focusNonce: number;
  width: number;
  setWidth: (width: number) => void;
  saveWidth: () => void;
};

/** A panel's name to telemetry: its title's words joined, each capitalised (`Line numbers` is `LineNumbers`). */
const telemetryName = (title: string): string =>
  title
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

export function useOfficePanels({
  kind,
  panels,
  onFocusDocument,
  writes = true,
}: {
  // `TextDocument`: `UI · Opened · TextDocumentPanel<Title>`, and where its open panels are kept.
  kind: 'TextDocument' | 'PdfDocument' | 'Spreadsheet';
  panels: readonly OfficePanelSpec[];
  // Gives the keyboard back to the document once a panel closes.
  onFocusDocument: () => void;
  // The session writes: an Editor's panels are offered (office-shell.md "Side panels").
  writes?: boolean;
}): OfficePanelsState {
  const [stored, setOpen] = useState<OpenPanels>(() => readOpenPanels(kind, panels));
  const [focusNonce, setFocusNonce] = useState(0);
  const [width, setWidth] = useState(readOfficePanelWidth);
  // A panel the session is not offered is shown closed, still remembered open for when it is.
  const offered = useCallback(
    (id: string | null) =>
      id !== null && (writes || !panels.find((p) => p.id === id)?.editorsOnly) ? id : null,
    [panels, writes],
  );
  const open = useMemo(
    (): OpenPanels => ({ left: offered(stored.left), right: offered(stored.right) }),
    [offered, stored],
  );

  const change = useCallback(
    (next: OpenPanels) => {
      setOpen(next);
      writeOpenPanels(kind, next);
    },
    [kind],
  );

  const close = useCallback(
    (side: OfficePanelSide) => {
      debugLog('[office] panel closed', { side });
      change(OpenPanels.close(stored, side));
      onFocusDocument();
    },
    [change, stored, onFocusDocument],
  );

  const openPanel = useCallback(
    (panel: OfficePanelSpec) => {
      track('UI', 'Opened', `${kind}Panel${telemetryName(panel.title)}`);
      debugLog('[office] panel open', { id: panel.id });
      change(OpenPanels.toggle(stored, panel));
      setFocusNonce((n) => n + 1);
    },
    [kind, change, stored],
  );

  const actions = useMemo(() => {
    const out: Record<string, OfficeActions[string]> = {};
    for (const panel of panels) {
      if (panel.editorsOnly && !writes) continue;
      const isOpen = open[panel.side] === panel.id;
      const toggle = {
        checked: isOpen,
        run: () => (isOpen ? close(panel.side) : openPanel(panel)),
      };
      for (const item of [panel.item, ...(panel.alsoItems ?? [])]) out[item] = toggle;
    }
    return out;
  }, [panels, open, close, openPanel, writes]);

  const reveal = useCallback(
    (panel: OfficePanelSpec) => {
      if (open[panel.side] === panel.id) setFocusNonce((n) => n + 1);
      else openPanel(panel);
    },
    [open, openPanel],
  );

  return {
    open,
    actions,
    close,
    reveal,
    focusNonce,
    width,
    setWidth,
    saveWidth: () => writeOfficePanelWidth(width),
  };
}
