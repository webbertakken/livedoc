// A wireframe page's frame in the tab theme's colours (docs/specs/007-editor/wireframe-pages.md "Choosing the device"):
// what every board reads to know a frame's colours; drawing the frame is wireframe-device-svg.ts's, which loads with
// the wireframes family (docs/specs/016-platform/web-performance.md).
import type { Finish } from './finish';
import { deviceScreenPath, type DeviceGeometry } from './wireframe-device';

// The colours a Theme frame is drawn from (wireframeFrameTheme): the tab theme's element stroke as
// the device's colour, its canvas, and its element fill and text for a browser's address field.
export type WireframeFrameTheme = {
  accent: string;
  background: string;
  fill?: string | null;
  text?: string | null;
  // The tab's finish: Sketch and Marker draw the frame by hand, as lines.
  finish?: Finish;
};

// A Theme frame with no theme to hand: the slate the default scheme draws in.
export const NEUTRAL_THEME: WireframeFrameTheme = { accent: '#334155', background: '#f8fafc' };

/** A theme's colours as a Theme frame reads them. */
export function wireframeFrameTheme(theme: {
  elementStroke: string | null;
  elementFill: string | null;
  elementText: string | null;
  backgroundColor: string;
  rootColor?: { stroke?: string };
}): WireframeFrameTheme {
  return {
    accent: theme.elementStroke ?? theme.rootColor?.stroke ?? NEUTRAL_THEME.accent,
    background: theme.backgroundColor,
    fill: theme.elementFill,
    text: theme.elementText,
  };
}

/** The screen's outline at the page's top-left: what the page's content is clipped to. */
export function wireframeScreenPath(g: DeviceGeometry, ox: number, oy: number): string {
  return deviceScreenPath(g, ox, oy);
}
