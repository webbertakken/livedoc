import type { CSSProperties } from 'react';
import { CONTEXT_INK } from '@livedoc/document';

// The candidate contexts' inks as custom properties (docs/specs/021-event-storming/candidate-contexts.md "Its
// outline, exactly"): the light pair, swapped for the dark pair on a dark canvas by `.lvd-context` (globals.css).
// Whatever draws in the contexts' muted slate sets these on a `.lvd-context` root and inks with `var(--ctx-line)`.
export const CONTEXT_INK_VARS = {
  '--ctx-line-light': CONTEXT_INK.light.line,
  '--ctx-name-light': CONTEXT_INK.light.name,
  '--ctx-line-dark': CONTEXT_INK.dark.line,
  '--ctx-name-dark': CONTEXT_INK.dark.name,
} as CSSProperties;
