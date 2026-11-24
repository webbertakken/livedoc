'use client';

// The Alternating Colours side panel's body (docs/specs/029-sheets/formatting.md "Alternating colours", D216): the
// banding the selection touches, its range, its Header and Footer switches, the default styles and a custom one, and
// Remove Alternating Colours. Each control writes at once; a selection with none offers to add one.
import { useEffect, useState } from 'react';
import { Button, Switch, TextInput } from '@livedoc/ui';
import {
  BANDING_STYLES,
  bandingWith,
  formatRange,
  parseRangeText,
  posRangeOf,
  type Banding,
  type BandingColours,
} from '@livedoc/sheets';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { OFFICE_COLOUR_ROWS } from '@/components/office/OfficeColourControl';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { useSheetController } from '../sheet-controller';
import type { SheetActions } from '../useSheetActions';

// The office kinds' picker before Themes: the standard rows and custom colours (D199).
const NO_THEME: readonly never[] = [];

export const NO_BANDING = 'These cells have no alternating colours.';
export const BANDING_OVERLAP = "Alternating colours can't overlap";
export const BANDING_RANGE = 'Type a range like A1:D20';

const COLOURS: { key: keyof BandingColours; label: string }[] = [
  { key: 'head', label: 'Header' },
  { key: 'band1', label: 'Colour 1' },
  { key: 'band2', label: 'Colour 2' },
  { key: 'foot', label: 'Footer' },
];

const sameColours = (a: BandingColours, b: BandingColours) =>
  a.head === b.head && a.band1 === b.band1 && a.band2 === b.band2 && a.foot === b.foot;

// A default style's swatch: its header over colour 1 and colour 2.
function StyleSwatch({ colours }: { colours: BandingColours }) {
  return (
    <span
      aria-hidden
      className="flex h-row w-10 flex-col overflow-hidden rounded-control border border-slate-300 dark:border-slate-600"
    >
      {[colours.head, colours.band1, colours.band2].map((bg, i) => (
        <span key={i} className="flex-1" style={{ background: bg }} />
      ))}
    </span>
  );
}

export function SheetBandingsBody({
  actions,
  onClose,
}: {
  actions: SheetActions;
  onClose: () => void;
}) {
  const c = useSheetController();
  const yours = useDocumentColours();
  const band = actions.selectedBanding();
  const layout = c.sheet.layout;
  const p = band ? posRangeOf(layout, band) : null;
  const shown = p ? formatRange(p) : '';
  const [range, setRange] = useState(shown);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    setRange(shown);
    setWhy(null);
  }, [shown]);

  if (!band) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-supporting text-slate-500 dark:text-slate-400">{NO_BANDING}</p>
        <Button variant="secondary" size="xs" onClick={() => actions.addBanding()}>
          Add Alternating Colours
        </Button>
      </div>
    );
  }
  const set = (next: Banding) => actions.setBanding(next);
  const commitRange = () => {
    if (range.trim() === shown) return;
    const g = parseRangeText(range);
    const ids =
      g && g.r2 < layout.rows.length && g.c2 < layout.cols.length ? actions.rangeIds(g) : null;
    if (!g || !ids) return setWhy(BANDING_RANGE);
    // The selection follows the range, so the panel keeps the banding.
    if (set({ ...band, ...ids })) actions.goTo(g);
    else setWhy(BANDING_OVERLAP);
  };
  const toggle = (key: 'header' | 'footer') => {
    const { [key]: on, ...rest } = band;
    set(on ? rest : { ...rest, [key]: true });
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-supporting text-slate-600 dark:text-slate-300">Apply to Range</span>
        <TextInput
          aria-label="Apply to Range"
          aria-invalid={why ? true : undefined}
          aria-describedby={why ? 'banding-why' : undefined}
          value={range}
          onChange={(e) => setRange(e.target.value)}
          onBlur={commitRange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRange();
          }}
        />
      </label>
      {why ? (
        <p id="banding-why" role="alert" className="text-supporting text-red-700 dark:text-red-300">
          {why}
        </p>
      ) : null}
      <div className="flex gap-4">
        {(['header', 'footer'] as const).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-2">
            <Switch
              size="sm"
              checked={!!band[key]}
              onChange={() => toggle(key)}
              label={key === 'header' ? 'Header' : 'Footer'}
            />
            {key === 'header' ? 'Header' : 'Footer'}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-supporting text-slate-600 dark:text-slate-300">Default Styles</span>
        <div role="group" aria-label="Default Styles" className="grid grid-cols-4 gap-2">
          {BANDING_STYLES.map((style) => (
            <button
              key={style.label}
              type="button"
              aria-label={style.label}
              aria-pressed={sameColours(band, style.colours)}
              className="flex cursor-pointer justify-center rounded-control p-1 hover:bg-slate-100 aria-pressed:ring-2 aria-pressed:ring-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-700"
              onClick={() => set(bandingWith(band, style.colours))}
            >
              <StyleSwatch colours={style.colours} />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-supporting text-slate-600 dark:text-slate-300">Custom Style</span>
        <div className="flex gap-3">
          {COLOURS.map(({ key, label }) => (
            <span key={key} className="flex flex-col items-center gap-1 text-supporting">
              <ColourSwatchButton
                label={label}
                swatch={band[key]}
                value={band[key]}
                theme={NO_THEME}
                standard={OFFICE_COLOUR_ROWS}
                yours={yours}
                onPick={(id) => set({ ...band, [key]: id.toLowerCase() })}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-between gap-2">
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            actions.removeBanding(band.id);
            onClose();
          }}
        >
          Remove Alternating Colours
        </Button>
        <Button size="xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
