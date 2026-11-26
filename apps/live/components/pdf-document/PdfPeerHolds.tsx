'use client';

// What collaborators hold on a page (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"; marks.md
// "Together"): a mark outlined in the person's colour, a text selection tinted in it; their name over it for
// PDF_PRESENCE_FRESH_MS after the hold moves (another mark or text held, or the mark moved or resized) and while the
// pointer is over it. Drawn over the page, never in its way: presses fall through, and assistive technology hears
// presence from the title row's people.
import { useEffect, useRef, useState } from 'react';
import { Mark, type PageMatrix, type PagePoint, type Quad } from '@livedoc/pdf-documents';
import { OfficePeerTag } from '@/components/office/OfficePeerTag';
import type { PdfPeerHold } from '@/lib/pdf-document/pdf-presence-held';
import { PDF_PRESENCE_FRESH_MS } from '@/lib/pdf-document/pdf-presence-store';
import type { PdfPeerTextQuads } from '@/lib/pdf-document/usePdfPeerTexts';
import { pointsOf } from './PdfMarksOverlay';
import { linkBox, percentStyle } from './PdfPageLinks';

type Bounds = readonly [number, number, number, number];

/** How strongly a collaborator's text selection is tinted: a person's own selection is 0.35 in the focus colour. */
const PEER_TEXT_TINT = 0.3;

/** A mark's box `gap` points out from it and its line, in page space. */
function heldBounds(mark: Mark, gap: number): Bounds {
  const [left, bottom, right, top] = Mark.bounds(mark);
  const out = gap + ('width' in mark ? mark.width / 2 : 0);
  return [left - out, bottom - out, right + out, top + out];
}

/** The box round quads, in page space. */
function quadsBounds(quads: readonly Quad[]): Bounds {
  const xs = quads.flatMap((quad) => [quad[0], quad[2], quad[4], quad[6]]);
  const ys = quads.flatMap((quad) => [quad[1], quad[3], quad[5], quad[7]]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const within = ([left, bottom, right, top]: Bounds, at: PagePoint): boolean =>
  at.x >= left && at.x <= right && at.y >= bottom && at.y <= top;

/** One hold's box: drawn afresh each time it moves (keyed by what is held and where), so its name shows from then. */
function PeerBox({
  kind,
  held,
  person,
  color,
  bounds,
  outlined,
  matrix,
  width,
  height,
  hover,
}: {
  kind: 'mark' | 'text';
  held: string;
  person: { id: string; name: string };
  color: string;
  bounds: Bounds;
  outlined: boolean;
  matrix: PageMatrix;
  width: number;
  height: number;
  hover: boolean;
}) {
  const [at] = useState(() => Date.now());
  return (
    <div
      data-pdf-peer-hold={kind === 'mark' ? held : undefined}
      data-pdf-peer-text={kind === 'text' ? held : undefined}
      data-pdf-peer={person.id}
      className="pointer-events-none absolute"
      style={{
        ...percentStyle(linkBox(matrix, bounds, width, height)),
        ...(outlined ? { border: `2px solid ${color}` } : {}),
      }}
    >
      <OfficePeerTag
        text={person.name}
        color={color}
        freshMs={PDF_PRESENCE_FRESH_MS}
        at={at}
        hover={hover}
      />
    </div>
  );
}

/** Where the pointer is on the page as the file has it, while anything is held there; null off the page. */
function usePagePointer(
  target: HTMLElement | null,
  watched: boolean,
  pointAt: (client: { x: number; y: number }) => PagePoint | null,
): PagePoint | null {
  const [pointer, setPointer] = useState<PagePoint | null>(null);
  const reading = useRef(pointAt);
  useEffect(() => {
    reading.current = pointAt;
  });
  useEffect(() => {
    if (!target || !watched) return;
    const move = (event: PointerEvent) =>
      setPointer(reading.current({ x: event.clientX, y: event.clientY }));
    const leave = () => setPointer(null);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerleave', leave);
    return () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerleave', leave);
      setPointer(null);
    };
  }, [target, watched]);
  return pointer;
}

export function PdfPeerHolds({
  holds,
  texts = [],
  matrix,
  width,
  height,
  gap,
  target,
  pointAt,
}: {
  holds: readonly PdfPeerHold[];
  texts?: readonly PdfPeerTextQuads[];
  // Page space to view space, as the picture under it was drawn.
  matrix: PageMatrix;
  // The page as it shows, in points.
  width: number;
  height: number;
  // How far out from a mark its outline is, in points.
  gap: number;
  // The page's box, whose pointer shows a name again, and where a pointer is on the page as the file has it.
  target: HTMLElement | null;
  pointAt: (client: { x: number; y: number }) => PagePoint | null;
}) {
  const shownTexts = texts.filter((text) => text.quads.length > 0);
  const pointer = usePagePointer(target, holds.length + shownTexts.length > 0, pointAt);
  const over = (bounds: Bounds) => pointer !== null && within(bounds, pointer);
  const view = { matrix, width, height };
  return (
    <>
      {shownTexts.length > 0 ? (
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {shownTexts.map((text) => (
            <g
              key={text.id}
              data-pdf-peer-tint={text.id}
              fill={text.color}
              opacity={PEER_TEXT_TINT}
            >
              {text.quads.map((quad, at) => (
                <polygon key={at} points={pointsOf(matrix, quad)} />
              ))}
            </g>
          ))}
        </svg>
      ) : null}
      {shownTexts.map((text) => {
        const bounds = quadsBounds(text.quads);
        return (
          <PeerBox
            key={`${text.id} ${bounds.join(' ')}`}
            kind="text"
            held={text.id}
            person={text}
            color={text.color}
            bounds={bounds}
            outlined={false}
            hover={over(bounds)}
            {...view}
          />
        );
      })}
      {holds.map((hold) => {
        const bounds = heldBounds(hold.mark, gap);
        return (
          <PeerBox
            key={`${hold.id} ${hold.mark.id} ${bounds.join(' ')}`}
            kind="mark"
            held={hold.mark.id}
            person={hold}
            color={hold.color}
            bounds={bounds}
            outlined
            hover={over(bounds)}
            {...view}
          />
        );
      })}
    </>
  );
}
