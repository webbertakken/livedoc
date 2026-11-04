import { StrokeWeightIcon } from '@/components/palette/palette-style-previews';
import type { PenWidthId } from '@/lib/quick-style-pen';

// A marker width as a picture (docs/specs/023-draw-mode/draw-mode.md "Pens"), the same wherever a
// width is chosen: the marker's own popover and the quick style panel's Marker width row. The
// widths themselves (1, 1.5 and 2.5 px) are too close to tell apart drawn to scale (1 and 1.5 px
// look the same), so each is drawn as an evenly stepped line, thinnest first.
const WIDTH_PREVIEW_PX: Record<PenWidthId, number> = {
  fine: 1.5,
  medium: 3,
  bold: 4.5,
};

export function PenWidthIcon({ width }: { width: PenWidthId }) {
  // Inset 3: the round caps of the boldest stay inside the 18px box.
  return <StrokeWeightIcon px={WIDTH_PREVIEW_PX[width]} inset={3} />;
}
