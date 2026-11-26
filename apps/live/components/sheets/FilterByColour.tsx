'use client';

// A filter column's Filter by Colour (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"): the
// fill and text colours the column's cells are drawn in, each a swatch named by its colour; pressing one keeps only
// the rows drawn in it, pressing it again lets every colour through. It filters by colours already there, so it is
// not a colour picker (colour-picker.md "Not colour pickers").
import type { FilterColour } from '@livedoc/sheets';
import { ColourSwatch } from '@/components/colour/ColourSwatch';
import { colourName } from '@/components/colour/colour-options';

const KEYS = [
  { key: 'bg', label: 'Fill Colour' },
  { key: 'fc', label: 'Text Colour' },
] as const;

export function FilterByColour({
  colours,
  value,
  onChange,
}: {
  // The column's drawn colours, by key, once each.
  colours: Record<FilterColour['key'], readonly string[]>;
  value: FilterColour | null;
  onChange: (next: FilterColour | null) => void;
}) {
  const none = colours.bg.length === 0 && colours.fc.length === 0;
  return (
    <div role="group" aria-label="Filter by Colour">
      <div className="mb-1 mt-2 text-supporting text-slate-500 dark:text-slate-400">
        Filter by Colour
      </div>
      {none ? (
        <p className="text-supporting text-slate-500 dark:text-slate-400">
          No colours in this column
        </p>
      ) : (
        KEYS.filter(({ key }) => colours[key].length > 0).map(({ key, label }) => (
          <div key={key} role="group" aria-label={label} className="flex items-center gap-2">
            <span className="w-20 shrink-0">{label}</span>
            <span className="flex min-w-0 flex-wrap gap-0.5">
              {colours[key].map((colour) => {
                const picked = value?.key === key && value.is === colour;
                return (
                  <ColourSwatch
                    key={colour}
                    label={colourName(colour)}
                    colour={colour}
                    picked={picked}
                    onClick={() => onChange(picked ? null : { key, is: colour })}
                  />
                );
              })}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
