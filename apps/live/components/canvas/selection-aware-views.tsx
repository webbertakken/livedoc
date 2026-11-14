'use client';

// The element layer's per-element selection readers (docs/specs/008-canvas/canvas-performance.md):
// each element view reads its own selected state from the store, so a selection change re-renders
// the views whose state flipped and not the layer that lays them out. Each wrapper is memoised as the
// view it wraps, so a layer render costs what it did.

import { memo, type ComponentProps, type PointerEvent as ReactPointerEvent } from 'react';
import { arrowRoutePoints, turnsByHand, type ArrowElement, type Element } from '@livedoc/document';
import { ArrowView, arrowViewPropsEqual } from '@/components/canvas/ArrowView';
import { BoxedElementView } from '@/components/canvas/BoxedElementView';
import { FreeArrowSelection } from '@/components/canvas/FreeArrowSelection';
import { BoxGripsPortal } from '@/components/canvas/SelectionGripsLayer';
import { useCanvasZoom } from '@/components/canvas/CanvasZoomContext';
import { useSelectionOf } from '@/hooks/canvas/useSelectionStore';
import { elementGrips } from '@/lib/canvas-selection';
import { elementSelectionFlags, sameFlags, type Selection } from '@/lib/selection-store';

const useFlagsOf = (id: string) =>
  useSelectionOf((s: Selection) => elementSelectionFlags(s, id), sameFlags);

type BoxedProps = ComponentProps<typeof BoxedElementView>;
type SelectableBoxedProps = Omit<
  BoxedProps,
  'isSelected' | 'isMultiSelected' | 'showHandles' | 'showAnchors' | 'showTurn'
> & { editingId: string | null };

export const SelectableBoxedView = memo(function SelectableBoxedView({
  editingId,
  ...props
}: SelectableBoxedProps) {
  const flags = useFlagsOf(props.element.id);
  const grips = elementGrips(props.element, flags.single, {
    editingId,
    isPaintMode: props.isPaintMode === true,
    tabLocked: props.tabLocked === true,
    readOnly: props.readOnly === true,
    resizable: props.resizable,
  });
  return (
    <BoxedElementView
      {...(props as BoxedProps)}
      isSelected={flags.selected}
      isMultiSelected={flags.multi}
      showHandles={grips.handles}
      showAnchors={grips.anchors}
      // An Editor turns a lone element that turns by hand from just outside its corners
      // (docs/specs/008-canvas/selection-transforms.md "Where zones appear").
      showTurn={grips.handles && props.readOnly !== true && turnsByHand(props.element)}
    />
  );
});

type ArrowProps = ComponentProps<typeof ArrowView>;
type SelectableArrowProps = Omit<ArrowProps, 'isSelected'>;

export const SelectableArrowView = memo(
  function SelectableArrowView(props: SelectableArrowProps) {
    const { selected } = useFlagsOf(props.arrow.id);
    return <ArrowView {...(props as ArrowProps)} isSelected={selected} />;
  },
  (a, b) => arrowViewPropsEqual(a as ArrowProps, b as ArrowProps),
);

type FreeArrowFrameProps = {
  arrow: ArrowElement;
  elements: Element[];
  // Editing, reshaping, read-only, tab-locked or painting: any of them hides the frame.
  standsDown: boolean;
  onBeginArrowTranslate: (id: string, e: ReactPointerEvent) => void;
  onBeginArrowScale: (
    id: string,
    handle: Parameters<ComponentProps<typeof FreeArrowSelection>['onBeginScale']>[0],
    e: ReactPointerEvent,
  ) => void;
};

// Whether the arrow wears the frame when it is the lone selection.
const frameable = ({ arrow, standsDown }: FreeArrowFrameProps) =>
  !standsDown && arrow.from.kind === 'free' && arrow.to.kind === 'free' && arrow.locked !== true;

// The board matters only to an arrow that can be framed (its frame follows the route): any other
// arrow's slot ignores it, so a document change renders no slot but a frameable arrow's
// (docs/specs/008-canvas/canvas-performance.md "A move re-renders what moved").
export function freeArrowFramePropsEqual(a: FreeArrowFrameProps, b: FreeArrowFrameProps): boolean {
  return (
    a.arrow === b.arrow &&
    a.standsDown === b.standsDown &&
    a.onBeginArrowTranslate === b.onBeginArrowTranslate &&
    a.onBeginArrowScale === b.onBeginArrowScale &&
    (a.elements === b.elements || !frameable(b))
  );
}

// A selected free arrow wears a box's selection: ring + scale handles (docs/specs/008-canvas/arrow-bending.md),
// portalled into the grips layer. Not while it is locked, edited or reshaped by a handle (the frame
// grew with every bend and read as a selection box being dragged out), nor in an edit-blocking mode.
export const FreeArrowFrame = memo(function FreeArrowFrame(props: FreeArrowFrameProps) {
  const { arrow, elements, onBeginArrowTranslate, onBeginArrowScale } = props;
  const { single } = useFlagsOf(arrow.id);
  const framed = single && frameable(props);
  if (!framed) return null;
  return (
    <FramedArrow
      arrow={arrow}
      elements={elements}
      onBeginArrowTranslate={onBeginArrowTranslate}
      onBeginArrowScale={onBeginArrowScale}
    />
  );
}, freeArrowFramePropsEqual);

// The one framed arrow's frame: it alone follows the zoom (its grips keep their screen size), so a
// zoom renders it and no other arrow's slot (docs/specs/008-canvas/canvas-performance.md).
function FramedArrow({
  arrow,
  elements,
  onBeginArrowTranslate,
  onBeginArrowScale,
}: Omit<ComponentProps<typeof FreeArrowFrame>, 'standsDown'>) {
  const zoom = useCanvasZoom();
  return (
    <BoxGripsPortal>
      <FreeArrowSelection
        arrowId={arrow.id}
        points={arrowRoutePoints(arrow, elements)}
        zoom={zoom}
        onBeginMove={(e) => onBeginArrowTranslate(arrow.id, e)}
        onBeginScale={(handle, e) => onBeginArrowScale(arrow.id, handle, e)}
      />
    </BoxGripsPortal>
  );
}
