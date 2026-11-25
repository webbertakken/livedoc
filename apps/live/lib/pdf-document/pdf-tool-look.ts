// A mark tool's look (docs/specs/035-pdf-documents/marks.md "Making a mark": The tool's look is remembered, A tool's
// line): what a new mark of its kind takes.
import type { LineStyle } from '@livedoc/pdf-documents';
import type { TextMarkLook } from './pdf-text-mark';

/** A tool's line: its width in points, its style (Solid held as none, as a mark holds it) and a shape's fill. */
export type ToolLine = {
  readonly width?: number;
  readonly lineStyle?: Exclude<LineStyle, 'solid'>;
  readonly fill?: string;
};

/** A tool's look: its colour and opacity, and for a kind with a line, that line. */
export type ToolLook = TextMarkLook & ToolLine;
