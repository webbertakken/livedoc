// The Text wrapping glyphs of the picture's bar (docs/specs/034-text-documents/objects.md "The picture's bar"), look
// (default) until a capture: a picture as a box and the text as lines, the way each wrap lays them out.
import { Glyph } from '@livedoc/ui';
import type { PictureWrapChoice } from '@/lib/text-document/text-document-picture-placing';

const LINE = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' } as const;

function Box({
  x,
  y,
  w,
  h,
  solid = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  solid?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={1}
      fill="currentColor"
      fillOpacity={solid ? 1 : 0.25}
      stroke="currentColor"
      strokeWidth={1.25}
    />
  );
}

const DRAWN: Record<PictureWrapChoice, () => React.ReactNode> = {
  // On the line, the text either side of it.
  inline: () => (
    <>
      <Box x={6} y={5} w={8} h={10} />
      <path d="M2 15H4.5M15.5 15H18" {...LINE} />
    </>
  ),
  // Beside the text, which runs down its other side.
  wrap: () => (
    <>
      <Box x={2} y={4} w={7} h={8} />
      <path d="M11.5 4.5H18M11.5 8H18M11.5 11.5H18M2 15.5H18" {...LINE} />
    </>
  ),
  // Across the column, the text above and below only.
  break: () => (
    <>
      <path d="M2 3H18M2 17H18" {...LINE} />
      <Box x={6} y={6} w={8} h={8} />
    </>
  ),
  // Under the lines.
  behind: () => (
    <>
      <Box x={5} y={4} w={10} h={12} />
      <path d="M2 7H18M2 10H18M2 13H18" {...LINE} />
    </>
  ),
  // Over the lines.
  front: () => (
    <>
      <path d="M2 7H18M2 10H18M2 13H18" {...LINE} />
      <Box x={5} y={4} w={10} h={12} solid />
    </>
  ),
};

export function PictureWrapGlyph({ wrap }: { wrap: PictureWrapChoice }) {
  return (
    <Glyph size={18} units={20}>
      {DRAWN[wrap]()}
    </Glyph>
  );
}
