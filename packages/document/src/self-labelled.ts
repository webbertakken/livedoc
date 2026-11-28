// Whether a shape writes its own text (docs/specs/009-elements), kept apart from the export renderer so the editor
// asks it without loading the renderer.
import { BEHAVIOUR_FACE_SHAPES } from './behaviour-face-shapes';
import { isCollabPanelShape } from './collab-shapes';
import { isSelfDrawingShape } from './data-shapes';
import type { BoxedElement } from './index';
import { isPersonNode } from './person-node';
import { isSeatingShape } from './seating';
import { isWebComponentShape } from './web-components';

// A shape that writes its own text, so no centred label is printed over it: a self-drawing shape
// (charts; the legend is its own case), a Collaborate panel, a Behaviour face other than the chair, a
// web component.
export function selfLabelled(el: BoxedElement): boolean {
  if (el.type !== 'shape') return false;
  return (
    (isSelfDrawingShape(el.shape) && el.shape !== 'legend') ||
    isCollabPanelShape(el.shape) ||
    (BEHAVIOUR_FACE_SHAPES.has(el.shape) && !isSeatingShape(el.shape) && el.shape !== 'room') ||
    isWebComponentShape(el.shape) ||
    // A boundary writes its own title in its tab or corner (docs/specs/009-elements/boundary.md).
    el.shape === 'boundary' ||
    // A cycle and a hub write their centre label themselves (docs/specs/009-elements/concept-graphics.md).
    el.shape === 'cycle' ||
    el.shape === 'hub' ||
    // A diagram key writes its title above its rows (docs/specs/009-elements/diagram-key.md).
    el.shape === 'diagram-key' ||
    // A sequence diagram's names are in its picture (docs/specs/009-elements/sequence-diagram.md).
    el.shape === 'sequence' ||
    // A person node writes its name beside its initials (docs/specs/009-elements/org-chart.md).
    isPersonNode(el)
  );
}
