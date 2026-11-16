'use client';

// A mind map root's halo (docs/specs/009-elements/mind-node.md "The root's halo"): a second outline a clear gap outside
// the node, drawn inside the node's own box so it turns and fades with it, and taking no pointer. Its geometry and
// colour come from the same functions as the export's.
import {
  mindHaloRing,
  mindHaloStroke,
  type CanvasSurface,
  type Finish,
  type ShapeElement,
} from '@livedoc/document';
import { useMindHaloRoot } from './MindMapLayer';

export function MindRootHalo({
  node,
  cornerPx,
  stroke,
  surface,
  finish,
}: {
  node: ShapeElement;
  cornerPx: number;
  // The node's own border colour, as the node draws it.
  stroke: string;
  surface: CanvasSurface;
  finish: Finish;
}) {
  if (!useMindHaloRoot(node.id)) return null;
  const ring = mindHaloRing(node, cornerPx, finish);
  const half = ring.strokeWidth / 2;
  // A CSS border is drawn inside its box, so the box reaches half a line past the ring's centre line.
  return (
    <span
      aria-hidden
      data-mind-halo=""
      className="pointer-events-none absolute"
      style={{
        left: ring.x - node.x - half,
        top: ring.y - node.y - half,
        width: ring.width + ring.strokeWidth,
        height: ring.height + ring.strokeWidth,
        border: `${ring.strokeWidth}px solid ${mindHaloStroke(stroke, surface)}`,
        borderRadius: ring.radius + half,
      }}
    />
  );
}
