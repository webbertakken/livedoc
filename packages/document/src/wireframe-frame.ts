// A wireframe page's frame as SVG (docs/specs/007-editor/wireframe-pages.md): the device's body under the screen, its
// camera and system bars over it, and the screen's outline. Loads with the wireframes family on the canvas
// (docs/specs/016-platform/web-performance.md); the export reads it as well.
import type { LaidOutPage } from './page';
import { wireframeFrameOverSvg, wireframeFrameUnderSvg } from './wireframe-device-svg';
import { wireframeScreenPath, type WireframeFrameTheme } from './wireframe-frame-theme';
import { pageDeviceGeometry, pageShowsSystemBars } from './wireframe-page';

export type WireframeFrameSvg = {
  // Under the screen: the device's body, bezel and its parts outside the screen.
  under: string;
  // Over the screen's content: the camera in the screen and the system bars.
  over: string;
  // The screen's outline, what the content is clipped to and the background paints.
  screen: string;
};

/** A wireframe page's frame as SVG in canvas px (`dark`: its screen's background is dark, so the
 *  system bars are white; `theme`: the tab theme's colours, for a frame in the Theme look), else
 *  null. */
export function wireframeFrameSvg(
  page: LaidOutPage,
  { dark, theme }: { dark: boolean; theme?: WireframeFrameTheme },
): WireframeFrameSvg | null {
  const g = pageDeviceGeometry(page);
  if (!g) return null;
  const look = page.frameLook ?? 'theme';
  const { x, y } = page.rect;
  return {
    under: wireframeFrameUnderSvg(g, look, x, y, page.name, theme),
    over: wireframeFrameOverSvg(g, look, x, y, {
      systemBars: pageShowsSystemBars(page),
      dark,
      ...(theme ? { theme } : {}),
    }),
    screen: wireframeScreenPath(g, x, y),
  };
}
