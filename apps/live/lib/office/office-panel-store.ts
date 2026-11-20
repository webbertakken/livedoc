// Where the office shell remembers its panels in this browser (docs/specs/004-interface-design/office-shell.md "Side
// panels"): the right panel's width, one for every kind, and which panels are open, per kind.
import {
  readLocalStorageSafe,
  safeJson,
  storedRecord,
  writeLocalStorageSafe,
} from '@/lib/local-storage-safe';
import { clampPanelWidth, OpenPanels, type OfficePanelSpec } from './office-panels';

export const OFFICE_PANEL_WIDTH_KEY = 'livedoc:v2:office-panel-width';
export const OFFICE_PANELS_KEY = 'livedoc:v2:office-panels';

export function readOfficePanelWidth(): number {
  const raw = readLocalStorageSafe(OFFICE_PANEL_WIDTH_KEY);
  return clampPanelWidth(raw === null ? Number.NaN : Number(raw));
}

export function writeOfficePanelWidth(width: number): void {
  writeLocalStorageSafe(OFFICE_PANEL_WIDTH_KEY, String(clampPanelWidth(width)));
}

function storedPanels(): Record<string, unknown> {
  const raw = readLocalStorageSafe(OFFICE_PANELS_KEY);
  return (raw === null ? null : storedRecord(safeJson(raw))) ?? {};
}

export function readOpenPanels(kind: string, panels: readonly OfficePanelSpec[]): OpenPanels {
  return OpenPanels.parse(storedPanels()[kind], panels);
}

export function writeOpenPanels(kind: string, open: OpenPanels): void {
  writeLocalStorageSafe(OFFICE_PANELS_KEY, JSON.stringify({ ...storedPanels(), [kind]: open }));
}
