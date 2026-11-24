// Format › Rotation › Custom Angle's field (docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation",
// D211): a whole number of degrees from −90 to 90, 0 clearing the rotation; anything else says why.
import { ROTATION_MAX, ROTATION_MIN, type CellFormat, type Rotation } from '@livedoc/sheets';

// Written with a true minus sign, as the menus write −90°.
export const CUSTOM_ANGLE_PROBLEM = `Enter a whole number of degrees from −${-ROTATION_MIN} to ${ROTATION_MAX}.`;

export type CustomAngle = { ok: true; ro: Rotation | null } | { ok: false; problem: string };

/** The field's start: the active cell's angle, 0 at none or stacked. */
export function customAngleStart(format: CellFormat | undefined): string {
  const ro = format?.ro;
  return String(typeof ro === 'number' ? ro : 0);
}

/** The field's text as the rotation it sets (null clears), or why it cannot be one. A typed minus sign is read too. */
export function customAngleOf(text: string): CustomAngle {
  const trimmed = text.trim().replace('−', '-');
  if (!/^[-+]?\d+$/.test(trimmed)) return { ok: false, problem: CUSTOM_ANGLE_PROBLEM };
  const deg = Number(trimmed);
  if (deg < ROTATION_MIN || deg > ROTATION_MAX) return { ok: false, problem: CUSTOM_ANGLE_PROBLEM };
  return { ok: true, ro: deg === 0 ? null : deg };
}
