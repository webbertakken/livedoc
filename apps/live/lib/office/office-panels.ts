// An office kind's side panels (docs/specs/004-interface-design/office-shell.md "Side panels"): declared as data, one
// open at a time on each side, the right one resizable between the narrowest and the widest.

export type OfficePanelSide = 'left' | 'right';

export type OfficePanelSpec = {
  id: string;
  title: string;
  side: OfficePanelSide;
  // The menu item that opens and closes it (an on/off check).
  item: string;
  // More menu items that open and close it too, checked alike.
  alsoItems?: readonly string[];
  // Offered only to a session that writes (an Editor): for the others its item is not bound and it is not drawn.
  editorsOnly?: true;
};

export const OFFICE_PANEL_WIDTH = { initial: 360, min: 280, max: 560, step: 16 } as const;
export const OFFICE_LEFT_PANEL_WIDTH = 260;

export function clampPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return OFFICE_PANEL_WIDTH.initial;
  return Math.round(Math.min(OFFICE_PANEL_WIDTH.max, Math.max(OFFICE_PANEL_WIDTH.min, width)));
}

// The id of the panel open on each side, or null.
export type OpenPanels = { readonly left: string | null; readonly right: string | null };

export const OpenPanels = {
  none: { left: null, right: null } as OpenPanels,
  // Opens the panel, closing the one on its side; closes it when it is the one open.
  toggle: (open: OpenPanels, panel: OfficePanelSpec): OpenPanels => ({
    ...open,
    [panel.side]: open[panel.side] === panel.id ? null : panel.id,
  }),
  close: (open: OpenPanels, side: OfficePanelSide): OpenPanels => ({ ...open, [side]: null }),
  // A stored value, trusted only for ids the kind declares on that side.
  parse: (raw: unknown, panels: readonly OfficePanelSpec[]): OpenPanels => {
    const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const sideOf = (side: OfficePanelSide) =>
      panels.find((p) => p.side === side && p.id === record[side])?.id ?? null;
    return { left: sideOf('left'), right: sideOf('right') };
  },
} as const;
