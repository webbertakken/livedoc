import type { CanvasTool } from '@/components/palette/palette.types';

// Escape backs out (docs/specs/004-interface-design/escape.md): the transient layers a person can be in, innermost
// first, and the one a single press of Escape leaves. Pure: each listener says which layers are present where it
// stands, and acts only when the layer it owns is the innermost.

export type EscapeLayer =
  'field' | 'gesture' | 'surface' | 'highlight' | 'tool' | 'selection' | 'zen';

/** The layers, innermost first. */
export const ESCAPE_LADDER: readonly EscapeLayer[] = [
  'field',
  'gesture',
  'surface',
  'highlight',
  'tool',
  'selection',
  'zen',
];

/** Which layers are present; an absent key is a layer that is not. */
export type EscapeState = Partial<Record<EscapeLayer, boolean>>;

/** The layer one press of Escape backs out of, or null when nothing transient is present. */
export function escapeLayer(state: EscapeState): EscapeLayer | null {
  return ESCAPE_LADDER.find((layer) => state[layer] === true) ?? null;
}

/** The tool the canvas rests on, which Escape puts every other tool down to: Hand on a touch screen, else Select. */
export function restingTool(touch: boolean): 'select' | 'pan' {
  return touch ? 'pan' : 'select';
}

/** Whether a canvas tool is one in hand, which Escape puts down: any but the resting tool, and Select. */
export function toolInHand(tool: CanvasTool, touch: boolean): boolean {
  return tool !== 'select' && tool !== restingTool(touch);
}
