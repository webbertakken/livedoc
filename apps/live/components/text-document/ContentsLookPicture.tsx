// A small picture of a table of contents' look (docs/specs/034-text-documents/links-and-navigation.md "Table of
// contents"), shown on Insert > Table of contents' items and the options panel's choice: three entries, the second a
// level in; Plain text with page numbers at the right, Dotted with dots leading to them, With blue links in the link
// colour without them. Decorative: the look's name says it.
import type { ContentsLook } from '@livedoc/text-documents';

// Each entry's row and how far its text runs, in the picture's units (48 × 32).
const ROWS = [
  { y: 8, from: 4, to: 24 },
  { y: 16, from: 10, to: 28 },
  { y: 24, from: 4, to: 20 },
] as const;
const NUMBER_FROM = 40;
const NUMBER_TO = 44;
const LINK_TO = 36;

export function ContentsLookPicture({ look }: { look: ContentsLook }) {
  return (
    <svg
      width={48}
      height={32}
      viewBox="0 0 48 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      className="contents-look-picture"
    >
      <rect
        x={0.5}
        y={0.5}
        width={47}
        height={31}
        rx={3}
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.4}
      />
      {ROWS.map((row) => (
        <g key={row.y}>
          <line
            data-part="entry"
            x1={row.from}
            x2={look === 'links' ? Math.min(LINK_TO, row.to + 8) : row.to}
            y1={row.y}
            y2={row.y}
            stroke="currentColor"
            className={look === 'links' ? 'contents-look-link' : undefined}
          />
          {look === 'dotted' ? (
            <line
              data-part="leader"
              x1={row.to + 3}
              x2={NUMBER_FROM - 3}
              y1={row.y}
              y2={row.y}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="0.5 2"
            />
          ) : null}
          {look !== 'links' ? (
            <line
              data-part="number"
              x1={NUMBER_FROM}
              x2={NUMBER_TO}
              y1={row.y}
              y2={row.y}
              stroke="currentColor"
            />
          ) : null}
        </g>
      ))}
    </svg>
  );
}
