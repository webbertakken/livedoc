// Format › Rotation and the toolbar's Text Rotation (docs/specs/029-sheets/formatting.md "Alignment, wrapping,
// rotation"): None, Tilt Up (45°), Tilt Down (−45°), Stack Vertically, Rotate Up (90°) and Rotate Down (−90°), each
// ticked by the active cell's rotation; Custom Angle opens its dialog (D211).
import type { CellFormat, FormatPatch, Rotation } from '@livedoc/sheets';
import type { OfficeAction } from '@/lib/office/office-catalogue';

/** Each rotation item's id and the rotation it sets; None's, none. */
export const ROTATION_ITEMS: readonly { id: string; ro: Rotation | null }[] = [
  { id: 'rotate-none', ro: null },
  { id: 'rotate-tilt-up', ro: 45 },
  { id: 'rotate-tilt-down', ro: -45 },
  { id: 'rotate-stack-vertically', ro: 'v' },
  { id: 'rotate-up', ro: 90 },
  { id: 'rotate-down', ro: -90 },
];

/** What the rotation items read and run: the active cell's format, the grid's format, the Custom Angle dialog. */
export type RotationPort = {
  format: CellFormat | undefined;
  setFormat: (patch: FormatPatch) => void;
  openCustomAngle: () => void;
};

export function rotationBindings({
  format,
  setFormat,
  openCustomAngle,
}: RotationPort): Record<string, OfficeAction> {
  const now = format?.ro ?? null;
  const out: Record<string, OfficeAction> = {
    'rotate-custom-angle': { run: openCustomAngle },
  };
  for (const { id, ro } of ROTATION_ITEMS)
    out[id] = { run: () => setFormat({ ro }), checked: now === ro };
  return out;
}
