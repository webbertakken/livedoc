'use client';

import { BRAND_KINDS, BrandMark, type BrandKindShape } from '@livedoc/ui';
import { useEffect, useRef, useState } from 'react';

// The homepage's every-kind mark (docs/specs/004-interface-design/brand-mark.md "Every kind"; the numbers are in
// docs/specs/004-interface-design/brand-mark.md): above the hero's question, the mark on its own with
// its page cycling through a page, a sheet, a board and a form, the kind's name beneath. The cycle is CSS
// (app/hero-kinds.css), drawn in the static HTML so it never shifts the layout; it pauses while off screen.

const INK = 'var(--ldm-n)';

function Shape({ shape }: { shape: BrandKindShape }) {
  if (shape.type === 'line')
    return (
      <path
        d={shape.d}
        strokeWidth={shape.width}
        strokeLinecap="round"
        fill="none"
        style={{ stroke: INK }}
      />
    );
  const { x, y, width, height, radius, fill, stroke } = shape;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={radius}
      strokeWidth={stroke}
      style={{
        fill: fill ? INK : 'none',
        fillOpacity: fill,
        stroke: stroke ? INK : 'none',
      }}
    />
  );
}

export function HeroKinds() {
  const root = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    const observer = new IntersectionObserver(([entry]) => setPaused(!entry?.isIntersecting));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={root}
      className="hero-kinds flex flex-col items-center gap-1.5"
      data-paused={paused ? '' : undefined}
    >
      <div role="img" aria-label="Pages, sheets, boards and forms">
        <BrandMark
          variant="full"
          className="size-20"
          pageContent={
            <g opacity={0.9}>
              {BRAND_KINDS.map((kind) => (
                <g key={kind.key} data-kind={kind.key}>
                  {kind.shapes.map((shape, i) => (
                    <Shape key={i} shape={shape} />
                  ))}
                </g>
              ))}
            </g>
          }
        />
      </div>
      <span
        aria-hidden="true"
        className="relative h-5 w-16 text-sm font-semibold text-(--hero-muted)"
      >
        {BRAND_KINDS.map((kind) => (
          <span key={kind.key} data-kind-name={kind.key} className="absolute inset-0 text-center">
            {kind.name}
          </span>
        ))}
      </span>
    </div>
  );
}
