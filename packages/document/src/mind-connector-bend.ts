// Bending a mind connector by dragging its line (docs/specs/009-elements/mind-node.md "Halfway between parent and
// child", docs/specs/008-canvas/arrow-bending.md).
//
// A connector a finish routes is drawn in a shape the stored arrow does not have (mind-connector-route.ts), so a
// bend planned from the stored arrow would jump to another shape on the first move. The bend is planned from the
// line as drawn instead, with its ends exact where they are drawn, and the bend keeps them exact.

import { planArrowBend, type BendPlan } from './arrow-bend';
import { sCurvePoint } from './arrow-path';
import { endpointPosition, type Point } from './geometry';
import type { Finish } from './finish';
import { finishRoutedArrow } from './mind-connector-route';
import type { ArrowElement, Element } from './index';

/**
 * The bend a press at `grab` on the line plans, from the line as the finish draws it; null when the line does not
 * bend: a stored curve the Professional bracket draws right-angled is the map's shape. A Z slides the segment
 * grabbed. An S bends through the point grabbed, between its shoulders a quarter and three quarters along it. A
 * line drawn as stored, or a bubble map's straight spoke, bends as stored.
 */
export function planArrowBendInFinish(
  arrow: ArrowElement,
  elements: Element[],
  finish: Finish,
  grab: Point,
): BendPlan | null {
  const drawn = finishRoutedArrow(arrow, elements, finish);
  if (drawn.arrow === arrow || drawn.style === 'straight')
    return planArrowBend(arrow, elements, grab);
  if (drawn.style === 'angled' && arrow.arrowStyle !== 'angled') return null;
  const source = drawn.style === 's-curve' ? throughShoulders(drawn.arrow, elements) : drawn.arrow;
  // Planned against the board as drawn: the source's exact ends sit out of the fan, as on screen.
  const board = elements.map((el) => (el.id === arrow.id ? source : el));
  return { ...planArrowBend(source, board, grab), exactEnds: true };
}

// The S's copy as a curve through its shoulders: a spline through them follows the S closely, so a point
// inserted between them pulls its middle without changing the rest.
function throughShoulders(arrow: ArrowElement, elements: Element[]): ArrowElement {
  const from = endpointPosition(arrow.from, elements);
  const to = endpointPosition(arrow.to, elements);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const shoulder = (t: number) => {
    const p = sCurvePoint(from, to, arrow.from, arrow.to, t);
    return { dx: p.x - mid.x, dy: p.y - mid.y };
  };
  return { ...arrow, curvePoints: [shoulder(0.25), shoulder(0.75)] };
}
