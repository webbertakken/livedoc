// The display label renderers (docs/specs/008-canvas/canvas-and-palette.md), split out of element-labels.tsx: the
// fixed-size single-line label, the sticky multi-line label, and the per-range RichLabel. renderLabel (the
// dispatcher the element views call) stays in element-labels.tsx and picks between them.

import { renderUnits } from './animated-words';
import { LabelWords } from './LabelWords';
import type { TextAnimView } from './useTextAnimation';
import {
  type BoxedElement,
  type TextAlignX,
  type TextAlignY,
  type TextRun,
  labelFontPx,
  type TextSize,
} from '@livedoc/document';
import {
  ALIGN_ITEMS,
  effectiveRunStyle,
  labelTypographyClass,
  labelBasePx,
  labelRunPx,
  labelTextStyleCss,
  wordmarkTextCss,
  TEXT_ALIGN,
  type LabelPadding,
  type LabelTextStyle,
} from '@/components/canvas/label-style';

// --- Fixed-size single-line label (Scale, a preset or a px) ---------------------

export function FixedSizeLabel({
  text,
  px,
  alignX,
  alignY,
  padding,
  style,
  animClass,
  textAnim,
}: {
  text: string;
  // The label's font px: its size preset's, times a text box's Shift-resize scale.
  px: number;
  alignX: TextAlignX;
  alignY: TextAlignY;
  // A number of px on every side, or a CSS padding (a whiteboard text box's 2px 4px).
  padding: LabelPadding;
  style?: LabelTextStyle;
  // Text-native animation class for the glyphs (docs/specs/008-canvas/canvas-and-palette.md); see renderLabel.
  animClass?: string;
  // Text animation (docs/specs/028-animation/element-animations.md): the words split into units.
  textAnim?: TextAnimView;
}) {
  if (!text) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 flex overflow-hidden font-medium leading-tight"
      style={{
        fontSize: `${px}px`,
        alignItems: ALIGN_ITEMS[alignY],
        padding,
      }}
    >
      <div
        // Keyed by the animation, so picking another restarts it: reveals share a keyframe name, and a
        // finished play-once would otherwise stay finished.
        key={textAnim?.className}
        className={`w-full whitespace-pre-wrap break-words ${textAnim?.className ?? animClass ?? ''}`}
        style={{
          textAlign: TEXT_ALIGN[alignX],
          ...labelTextStyleCss(style ?? {}),
          ...textAnim?.style,
        }}
        // Animated, the text is drawn in pieces: read it as one labelled picture, never letter by letter.
        role={textAnim?.ariaLabel ? 'img' : undefined}
        aria-label={textAnim?.ariaLabel}
      >
        <LabelWords>{textAnim ? renderUnits(text, textAnim.plan, { next: 0 }) : text}</LabelWords>
      </div>
    </div>
  );
}

// --- Multi-line display (used by sticky) -----------------------------------

type MultilineLabelProps = {
  text: string;
  placeholder: string;
  textSize: TextSize;
  alignX: TextAlignX;
  alignY: TextAlignY;
  className?: string;
  // Auto-fit size (docs/specs/021-event-storming/event-storming.md): when the element's size is 'scale', the
  // caller measures the text against the box and passes the px it fits at,
  // so 'scale' means fill-the-note rather than a fixed small size. The
  // editor is handed the SAME number, or the text jumps on double-click.
  fitPx?: number;
};

export function MultilineLabel({
  text,
  placeholder,
  textSize,
  alignX,
  alignY,
  padding,
  className = '',
  style,
  fitPx,
  textAnim,
}: MultilineLabelProps & {
  padding: number;
  style?: LabelTextStyle;
  // Text animation (docs/specs/028-animation/element-animations.md): the note's words split into units.
  textAnim?: TextAnimView;
}) {
  const fontSize = `${fitPx ?? labelFontPx(textSize, true)}px`;
  const outerStyle = {
    fontSize,
    alignItems: ALIGN_ITEMS[alignY],
    padding,
  };
  const innerStyle = { textAlign: TEXT_ALIGN[alignX], ...labelTextStyleCss(style ?? {}) };
  if (!text) {
    return (
      <div
        style={outerStyle}
        className={`pointer-events-none absolute inset-0 flex overflow-hidden opacity-50 ${className}`}
      >
        <div className="w-full whitespace-pre-wrap" style={innerStyle}>
          {placeholder}
        </div>
      </div>
    );
  }
  return (
    <div
      style={outerStyle}
      className={`pointer-events-none absolute inset-0 flex overflow-hidden ${className}`}
    >
      <div
        // Keyed by the animation, so picking another restarts it: reveals share a keyframe name, and a
        // finished play-once would otherwise stay finished.
        key={textAnim?.className}
        className={`w-full whitespace-pre-wrap ${textAnim?.className ?? ''}`}
        style={{ ...innerStyle, ...textAnim?.style }}
        // Animated, the text is drawn in pieces: read it as one labelled picture, never letter by letter.
        role={textAnim?.ariaLabel ? 'img' : undefined}
        aria-label={textAnim?.ariaLabel}
      >
        {textAnim ? renderUnits(text, textAnim.plan, { next: 0 }) : text}
      </div>
    </div>
  );
}

// --- Per-range rich label (docs/specs/008-canvas/canvas-and-palette.md) ---------------------------------------

// Display renderer for a label carrying per-range formatting. Mirrors the
// FixedSizeLabel / MultilineLabel wrapper (alignment + padding + base font
// + family) and lays the runs out as styled <span>s at fixed px: per-run
// sizes and a note's whole-element fill would contradict each other; see
// docs/specs/008-canvas/canvas-and-palette.md.
export function RichLabel({
  runs,
  element,
  textSize,
  alignX,
  alignY,
  padding,
  textScale = 1,
  fontFamily,
  multiline,
  uppercase,
  wordmark,
  className = '',
  animClass,
  textAnim,
}: {
  runs: TextRun[];
  element: BoxedElement;
  textSize: TextSize;
  alignX: TextAlignX;
  alignY: TextAlignY;
  padding: LabelPadding;
  // A Shift-resized text box's scale on every size (docs/specs/023-draw-mode/draw-mode.md).
  textScale?: number;
  fontFamily?: string;
  multiline: boolean;
  // Paint in capitals (an event-storming note, docs/specs/021-event-storming/event-storming.md) — whole-label, so
  // it sits on the wrapper rather than on each run's style.
  uppercase?: boolean;
  // Wordmark type (docs/specs/007-editor/logo-pages.md): tracking, weight and case on the wrapper.
  wordmark?: LabelTextStyle;
  className?: string;
  // Text-native animation class for the glyphs (docs/specs/008-canvas/canvas-and-palette.md); see renderLabel.
  animClass?: string;
  // Text animation (docs/specs/028-animation/element-animations.md): each run splits in turn, the
  // unit index running through the whole label.
  textAnim?: TextAnimView;
}) {
  const counter = { next: 0 };
  const basePx = labelBasePx(multiline, textSize) * textScale;
  const runSizePx = labelRunPx(multiline, textScale);
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex overflow-hidden ${labelTypographyClass(
        multiline,
      )} ${className}`}
      style={{ fontSize: `${basePx}px`, alignItems: ALIGN_ITEMS[alignY], padding }}
    >
      <div
        // Keyed by the animation, so picking another restarts it: reveals share a keyframe name, and a
        // finished play-once would otherwise stay finished.
        key={textAnim?.className}
        className={`w-full whitespace-pre-wrap break-words ${textAnim?.className ?? animClass ?? ''}`}
        // Animated, the text is drawn in pieces: read it as one labelled picture, never letter by letter.
        role={textAnim?.ariaLabel ? 'img' : undefined}
        aria-label={textAnim?.ariaLabel}
        style={{
          ...textAnim?.style,
          textAlign: TEXT_ALIGN[alignX],
          fontFamily,
          ...(wordmark ? wordmarkTextCss(wordmark) : {}),
          textTransform:
            uppercase || wordmark?.uppercase
              ? 'uppercase'
              : wordmark?.lowercase
                ? 'lowercase'
                : undefined,
        }}
      >
        {runs.map((run, i) => (
          <LabelWords key={i} style={effectiveRunStyle(run, element, runSizePx)}>
            {textAnim ? renderUnits(run.text, textAnim.plan, counter, `${i}:`) : run.text}
          </LabelWords>
        ))}
      </div>
    </div>
  );
}
