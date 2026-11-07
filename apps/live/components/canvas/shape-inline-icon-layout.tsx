import { type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  hasRichFormatting,
  inlineIconGap,
  inlineIconMetrics,
  type IconPosition,
  type ShapeElement,
  type ShapeMarker,
  type TextAlignX,
  type TextAlignY,
  type TextSize,
  type TextSizePreset,
} from '@livedoc/document';
import {
  ALIGN_ITEMS,
  effectiveRunStyle,
  labelRunPx,
  labelTextStyleCss,
  TEXT_ALIGN,
} from '@/components/canvas/label-style';
import { IconGlyph } from '@/components/primitives/icon-glyph';
import { ShapeMarkerGlyph } from '@/components/canvas/ShapeMarker';
import { HoverCard } from '@livedoc/ui';

// Inline-icon + marker + label layout for a shape, split out of
// BoxedElementView. Arranges an optional glyph and status marker beside
// (or above/below) the label, honouring the element's text alignment and
// padding, with the glyph sized relative to the label / box. Pure
// presentational: all inputs arrive as props, no element state.
export function ShapeInlineIconLayout({
  element,
  showIcon = true,
  marker,
  mindNumber,
  markerSize = 'scale',
  position,
  iconStroke,
  isEditing,
  editor,
  label,
  textColor,
  textSize,
  alignX,
  alignY,
  padding,
  fontFamily,
  draggableIcon,
  onIconPointerDown,
}: {
  element: ShapeElement;
  // Whether an inline icon glyph is present. False for a marker-only shape, so
  // the layout draws just the marker + label.
  showIcon?: boolean;
  // Optional status marker (docs/specs/009-elements/shape-markers.md), drawn immediately left of the label.
  marker?: ShapeMarker;
  markerSize?: TextSizePreset;
  // A numbered mind node's number (docs/specs/009-elements/mind-node.md "Numbered nodes"): a chip that leads the label.
  mindNumber?: number;
  position: IconPosition;
  iconStroke: string;
  isEditing: boolean;
  // The full label renderer (incl. the inline editor). Shown full-box
  // while editing so typing keeps the normal editor; the icon reappears
  // once the edit commits.
  editor: ReactNode;
  label: string;
  textColor: string;
  textSize: TextSize;
  // The element's resolved text alignment + padding, so the icon + label
  // group honours them the same way a label-only shape does (it used to be
  // hardcoded centre + a fixed 8px inset, ignoring both).
  alignX: TextAlignX;
  alignY: TextAlignY;
  padding: number;
  fontFamily?: string;
  // When true the glyph itself is grabbable (parent shape selected): a
  // pointer-drag repositions it to a different side via onIconPointerDown.
  draggableIcon?: boolean;
  onIconPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const isRow = position === 'left' || position === 'right';
  const iconFirst = position === 'left' || position === 'above';
  const { fontSize, iconSize, elementIconSize } = inlineIconMetrics(element, label, textSize);

  const iconGlyph = (
    <div
      className={`relative shrink-0 ${draggableIcon ? 'pointer-events-auto cursor-grab' : ''}`}
      style={{ width: iconSize, height: iconSize }}
      onPointerDown={draggableIcon ? onIconPointerDown : undefined}
    >
      <IconGlyph iconId={element.iconId} stroke={iconStroke} hasLabel={false} />
    </div>
  );
  // Only the draggable icon earns a hover card (the affordance hint); a static
  // icon needs none, so it skips the wrapper entirely.
  const iconBox = draggableIcon ? (
    <HoverCard title="Drag to move" description="Move the icon to another side of the label.">
      {iconGlyph}
    </HoverCard>
  ) : (
    iconGlyph
  );
  // The text flows (NOT absolute / flex-1) so the icon sits right beside
  // it and the whole group stays centred — `flex-1` previously stretched
  // the label and shoved the icon to the element edge. min-w-0 lets a
  // long label wrap / shrink instead of overflowing.
  // The wrapper carries the inline base font + colour; the inner content
  // carries the text styling. Per-range rich text (docs/specs/008-canvas/canvas-and-palette.md) renders one span
  // per run so an inline icon doesn't drop the formatting — the plain
  // whole-element path below ignored `richText`, which is why bold/italic
  // "didn't apply" once a shape also had an icon. `effectiveRunStyle` only
  // emits a run's overrides, so unstyled runs inherit this wrapper's size +
  // colour.
  const text = label.trim() ? (
    <span
      className="min-w-0 whitespace-pre-wrap break-words font-medium leading-tight"
      style={{ color: textColor, fontSize, fontFamily, textAlign: TEXT_ALIGN[alignX] }}
    >
      {hasRichFormatting(element.richText) ? (
        element.richText!.map((run, i) => (
          <span key={i} style={effectiveRunStyle(run, element, labelRunPx(false))}>
            {run.text}
          </span>
        ))
      ) : (
        <span
          style={labelTextStyleCss({
            bold: element.textBold,
            italic: element.textItalic,
            underline: element.textUnderline,
            strikethrough: element.textStrikethrough,
          })}
        >
          {label}
        </span>
      )}
    </span>
  ) : null;
  // Position the icon + label group per the element's alignment. The flex
  // main axis runs along the icon/label arrangement (horizontal for a side
  // icon, vertical for a stacked one), so the X alignment drives justify on a
  // row and align on a column, and vice-versa for Y. `padding` replaces the
  // old fixed 8px inset so the Text category's padding preset applies here too.
  const xFlex = X_ALIGN_FLEX[alignX];
  const yFlex = ALIGN_ITEMS[alignY];
  // While editing, the editor (rendered as a flex child via `inline`) takes
  // the text slot so the icon stays visible beside it as the user types and
  // both honour the element's alignment. On commit it swaps back to the
  // static `text`.
  const slot = isEditing ? editor : text;
  // The marker (docs/specs/009-elements/shape-markers.md) sits immediately left of the label, sized from its
  // own bucket: 'scale' tracks the label's font size (capped to the box), the
  // fixed buckets are small / medium / large dots.
  const markerPx = marker
    ? markerSize === 'scale'
      ? Math.max(10, Math.min(fontSize * 1.1, elementIconSize))
      : MARKER_FIXED_PX[markerSize]
    : 0;
  const markerGlyph = marker ? (
    <span className="shrink-0" style={{ width: markerPx, height: markerPx, lineHeight: 0 }}>
      <ShapeMarkerGlyph marker={marker} size={markerPx} color={textColor} />
    </span>
  ) : null;
  // The number chip: part of the card, in the label's colour on a tint of it, sized from the label.
  const chipPx = Math.max(16, Math.round(fontSize * 1.25));
  const numberChip =
    mindNumber !== undefined ? (
      <span
        data-mind-number={mindNumber}
        className="inline-flex shrink-0 items-center justify-center rounded-md font-bold tabular-nums"
        style={{
          minWidth: chipPx,
          height: chipPx,
          padding: `0 ${Math.round(chipPx * 0.25)}px`,
          fontSize: Math.round(chipPx * 0.62),
          fontFamily,
          color: textColor,
          background: `color-mix(in srgb, ${textColor} 16%, transparent)`,
        }}
      >
        {mindNumber}
      </span>
    ) : null;
  // Number, marker and label form one inline group so they hug the text and stay centred together (or centre alone
  // when there is no label).
  const content =
    markerGlyph || numberChip ? (
      <div
        className="flex min-w-0 items-center"
        style={{ gap: Math.max(6, Math.round(Math.max(markerPx, chipPx * 0.5) * 0.4)) }}
      >
        {numberChip}
        {markerGlyph}
        {slot}
      </div>
    ) : (
      slot
    );
  return (
    <div
      className="pointer-events-none absolute inset-0 flex"
      style={{
        flexDirection: isRow ? 'row' : 'column',
        justifyContent: isRow ? xFlex : yFlex,
        alignItems: isRow ? yFlex : xFlex,
        padding,
        // Side-by-side icon + text wants more breathing room than the
        // stacked layout, so the glyph doesn't crowd the first letter.
        gap: inlineIconGap(iconSize, isRow),
      }}
    >
      {showIcon ? (iconFirst ? iconBox : content) : content}
      {showIcon ? (iconFirst ? content : iconBox) : null}
    </div>
  );
}

// Fixed marker sizes (px) for the small / medium / large buckets; 'scale'
// tracks the label font size instead (see above).
const MARKER_FIXED_PX: Record<Exclude<TextSizePreset, 'scale'>, number> = {
  sm: 12,
  md: 18,
  lg: 26,
};

// Cross-axis flex mapping for the horizontal text alignment (the label-style
// ALIGN_ITEMS table covers the vertical one).
const X_ALIGN_FLEX: Record<TextAlignX, 'flex-start' | 'center' | 'flex-end'> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

// The metrics live with the export's inline icon (packages/document svg-render-inline-icon), so the canvas, the
// element indicators and every export agree on where the icon is.
export { inlineIconGap, inlineIconMetrics } from '@livedoc/document';
