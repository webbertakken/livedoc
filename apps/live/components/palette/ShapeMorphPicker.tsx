'use client';

// The Shape category's body (docs/specs/008-canvas/canvas-and-palette.md "Shape"): the common kinds as a grid, and a
// search over every kind a shape can become, so a box drawn first can turn into a mind node, a cloud or a phone. One
// component for the single-element and multi-selection menus. Hovering a kind previews it; a click commits.
import { useState } from 'react';
import type { ShapeKind } from '@livedoc/document';
import { TextInput } from '@livedoc/ui';
import { ShapeIcon } from '@/components/primitives/shape-icon';
import { onMouseHover } from '@/components/primitives/hover-preview';
import { shapeKindLabel } from '@/lib/element-names';
import { morphTargetLabel, searchMorphTargets } from '@/lib/shape-morph-targets';
import { COMMON_SHAPES } from './context-menu-constants';
import { SizeButton } from './palette-controls';

// The most results a query lists: one short column, never a scrolling list inside a menu.
export const SHAPE_MORPH_RESULT_LIMIT = 8;

export function ShapeMorphPicker({
  current,
  onPick,
  onPreview,
  onPreviewEnd,
}: {
  // The kind every target shares, marked; undefined for a mixed selection.
  current: ShapeKind | undefined;
  onPick: (kind: ShapeKind) => void;
  onPreview: (kind: ShapeKind) => void;
  onPreviewEnd: () => void;
}) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = searching ? searchMorphTargets(query).slice(0, SHAPE_MORPH_RESULT_LIMIT) : [];
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      <TextInput
        compact
        type="search"
        aria-label="Search shapes"
        placeholder="Search shapes"
        className="w-full"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // The menu's own keys (type-ahead, Escape to the canvas) stay out of the field.
          e.stopPropagation();
          if (e.key === 'Enter' && results[0]) onPick(results[0].kind);
          if (e.key === 'Escape') setQuery('');
        }}
      />
      {searching ? (
        results.length > 0 ? (
          <ul aria-label="Matching shapes" className="flex flex-col">
            {results.map((t) => (
              <li key={t.kind}>
                <button
                  type="button"
                  aria-pressed={current === t.kind}
                  onClick={() => onPick(t.kind)}
                  onPointerEnter={onMouseHover(() => onPreview(t.kind))}
                  onPointerLeave={onMouseHover(onPreviewEnd)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 aria-pressed:bg-brand-100 aria-pressed:text-brand-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:aria-pressed:bg-brand-500/20 dark:aria-pressed:text-brand-200"
                >
                  <ShapeIcon kind={t.kind} />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="px-1.5 py-1 text-xs text-slate-500 dark:text-slate-400">
            No shapes match
          </p>
        )
      ) : (
        <div className="grid grid-cols-5 gap-1">
          {COMMON_SHAPES.map((kind) => (
            <SizeButton
              key={kind}
              label={morphTargetLabel(kind) ?? shapeKindLabel(kind)}
              active={current === kind}
              onClick={() => onPick(kind)}
              onPointerEnter={onMouseHover(() => onPreview(kind))}
              onPointerLeave={onMouseHover(onPreviewEnd)}
            >
              <ShapeIcon kind={kind} />
            </SizeButton>
          ))}
        </div>
      )}
    </div>
  );
}
