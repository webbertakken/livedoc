'use client';

// An office toolbar's Borders panel (docs/specs/029-sheets/formatting.md "Borders", D209): the ten placements as a grid
// of two rows, then Border Colour (the one colour picker) and Border Style (the six lines), each opening in the panel
// under them. A placement draws its lines in the colour and style chosen and closes the panel; Escape or a press
// outside closes it too. The arrows move through the placements, as through any glyph grid.
import { useEffect, useRef, useState } from 'react';
import { Tooltip, useClickOutside, useEscape } from '@livedoc/ui';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { ColourPicker } from '@/components/colour/ColourPicker';
import {
  BorderLineGlyph,
  BorderPlacementGlyph,
  type BorderPlacement,
  type BorderStroke,
} from './border-glyphs';
import { OFFICE_COLOUR_ROWS } from './OfficeColourControl';
import { OfficeGlyphGrid } from './OfficeGlyphGrid';

export type OfficeBorderLine = 'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double';

/** What the kind hands the Borders panel: what a placement draws, and the colour and line it draws in. */
export type OfficeBorders = {
  apply: (placement: BorderPlacement) => void;
  // `#rrggbb`.
  colour: string;
  setColour: (colour: string) => void;
  line: OfficeBorderLine;
  setLine: (line: OfficeBorderLine) => void;
};

/** The six lines, Google's, each as it draws. */
export const OFFICE_BORDER_LINES: readonly {
  id: OfficeBorderLine;
  label: string;
  stroke: BorderStroke;
}[] = [
  { id: 'thin', label: 'Thin', stroke: { w: 1, s: 'solid' } },
  { id: 'medium', label: 'Medium', stroke: { w: 2, s: 'solid' } },
  { id: 'thick', label: 'Thick', stroke: { w: 3, s: 'solid' } },
  { id: 'dashed', label: 'Dashed', stroke: { w: 1, s: 'dashed' } },
  { id: 'dotted', label: 'Dotted', stroke: { w: 1, s: 'dotted' } },
  { id: 'double', label: 'Double', stroke: { w: 3, s: 'double' } },
];

/** The ten placements in Google's two rows. */
export const OFFICE_BORDER_PLACEMENTS: readonly { placement: BorderPlacement; label: string }[] = [
  { placement: 'all', label: 'All Borders' },
  { placement: 'inner', label: 'Inner Borders' },
  { placement: 'horizontal', label: 'Horizontal Borders' },
  { placement: 'vertical', label: 'Vertical Borders' },
  { placement: 'outer', label: 'Outer Borders' },
  { placement: 'left', label: 'Left Border' },
  { placement: 'top', label: 'Top Border' },
  { placement: 'right', label: 'Right Border' },
  { placement: 'bottom', label: 'Bottom Border' },
  { placement: 'none', label: 'Clear Borders' },
];

const NO_THEME: readonly never[] = [];
const NOTHING = () => {};

const TOOL =
  'flex h-field items-center gap-2 whitespace-nowrap rounded-control px-2 text-body text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-expanded:bg-(--office-pressed)';

export function OfficeBordersPanel({
  borders,
  controlId,
  onClose,
}: {
  borders: OfficeBorders;
  // The control it opens from: a press on it is the control's own, never outside.
  controlId: string;
  onClose: () => void;
}) {
  const yours = useDocumentColours();
  const [tool, setTool] = useState<'colour' | 'style' | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useClickOutside(panel, onClose, true, `[data-office-control="${controlId}"]`);
  useEscape(onClose);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, []);
  const stroke = OFFICE_BORDER_LINES.find((l) => l.id === borders.line)!;
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Borders"
      className="flex w-[18rem] flex-col gap-2 rounded-menu border border-(--office-line) bg-(--office-menu) p-2 shadow-lg animate-fade-in motion-reduce:animate-none"
    >
      <div className="h-[5.5rem]">
        <OfficeGlyphGrid
          label="Placements"
          items={OFFICE_BORDER_PLACEMENTS}
          keyOf={(p) => p.placement}
          nameOf={(p) => p.label}
          draw={(p) => <BorderPlacementGlyph placement={p.placement} />}
          onPick={(p) => {
            onClose();
            borders.apply(p.placement);
          }}
          onShow={NOTHING}
          columns={5}
        />
      </div>
      <div className="flex gap-1 border-t border-(--office-line) pt-2">
        <button
          type="button"
          aria-expanded={tool === 'colour'}
          onClick={() => setTool(tool === 'colour' ? null : 'colour')}
          className={TOOL}
        >
          <span
            aria-hidden="true"
            data-colour-bar={borders.colour}
            className="size-icon-row rounded-control border border-(--office-line)"
            style={{ background: borders.colour }}
          />
          Border Colour
        </button>
        <button
          type="button"
          aria-expanded={tool === 'style'}
          onClick={() => setTool(tool === 'style' ? null : 'style')}
          className={TOOL}
        >
          <BorderLineGlyph line={stroke.stroke} />
          Border Style
        </button>
      </div>
      {tool === 'colour' ? (
        <ColourPicker
          label="Border Colour"
          value={borders.colour}
          theme={NO_THEME}
          standard={OFFICE_COLOUR_ROWS}
          yours={yours}
          onPick={(picked) => {
            borders.setColour(picked);
            setTool(null);
          }}
        />
      ) : null}
      {tool === 'style' ? (
        <div role="radiogroup" aria-label="Border Style" className="grid grid-cols-6 gap-1">
          {OFFICE_BORDER_LINES.map((line) => (
            <Tooltip key={line.id} label={line.label}>
              <button
                type="button"
                role="radio"
                aria-checked={line.id === borders.line}
                aria-label={line.label}
                onClick={() => {
                  borders.setLine(line.id);
                  setTool(null);
                }}
                className={`flex h-field items-center justify-center rounded-control text-(--office-ink) outline-none hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) ${line.id === borders.line ? 'bg-(--office-pressed)' : ''}`}
              >
                <BorderLineGlyph line={line.stroke} />
              </button>
            </Tooltip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
