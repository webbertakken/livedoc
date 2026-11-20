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
  // Bumped each time a person opens a panel, so it takes focus.
  focusNonce: number;
  width: number;
  setWidth: (width: number) => void;
  saveWidth: () => void;
};

export function useOfficePanels({
  kind,
  panels,
  onFocusDocument,
}: {
  // `TextDocument`: `UI · Opened · TextDocumentPanel<Title>`, and where its open panels are kept.
  kind: 'TextDocument';
  panels: readonly OfficePanelSpec[];
  // Gives the keyboard back to the document once a panel closes.
  onFocusDocument: () => void;
}): OfficePanelsState {
  const [open, setOpen] = useState<OpenPanels>(() => readOpenPanels(kind, panels));
  const [focusNonce, setFocusNonce] = useState(0);
  const [width, setWidth] = useState(readOfficePanelWidth);

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
      change(OpenPanels.close(open, side));
      onFocusDocument();
    },
    [change, open, onFocusDocument],
  );

  const actions = useMemo(() => {
    const out: Record<string, OfficeActions[string]> = {};
    for (const panel of panels) {
      const isOpen = open[panel.side] === panel.id;
      out[panel.item] = {
        checked: isOpen,
        run: () => {
          if (isOpen) {
            close(panel.side);
            return;
          }
          track('UI', 'Opened', `${kind}Panel${panel.title.replace(/\s+/g, '')}`);
          debugLog('[office] panel open', { id: panel.id });
          change(OpenPanels.toggle(open, panel));
          setFocusNonce((n) => n + 1);
        },
      };
    }
    return out;
  }, [panels, open, kind, change, close]);

  return {
    open,
    actions,
    close,
    focusNonce,
    width,
    setWidth,
    saveWidth: () => writeOfficePanelWidth(width),
  };
}
