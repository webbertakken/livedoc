'use client';

// An office toolbar's colour control (docs/specs/034-text-documents/text-and-paragraphs.md "Colour"): its glyph with a
// bar under it in the colour at the caret, opening the one colour picker (docs/specs/004-interface-design/
// colour-picker.md) in its swatch-button skin. The picker offers what the page's light paper takes: no Theme Palette
// (an office document has no theme), the standard colours as a Light and a Dark row, then Custom Colours; the kind's
// leading option (Reset, None) leads it. Press keeps the writing's selection; a pick hands focus back to the writing.
import type { IconPrim } from '@livedoc/icons';
import { Glyph, Prims } from '@livedoc/ui';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { noColour, standardOptions, type ColourGroup } from '@/components/colour/colour-options';

/** What the kind hands a colour control: the colour now, how to set one, and its leading option's name. */
export type OfficeColour = {
  // `#rrggbb`, undefined for none, null over a selection of several.
  read: () => string | null | undefined;
  // A `#rrggbb`, or null for the leading option.
  set: (colour: string | null) => void;
  // The leading option: Reset (a text colour) or None (a highlight).
  leading: string;
  // What text with no colour of its own draws in, for the bar (black ink); none draws the bar as no colour.
  none?: string;
};

/** The kind's colour controls, by control id. */
export type OfficeColours = Readonly<Record<string, OfficeColour>>;

const LEADING_ID = 'leading';
const NO_THEME: readonly never[] = [];

/** The standard colours as the page's light paper takes them: the soft tone, then the strong, each by its hex. */
export const OFFICE_COLOUR_ROWS: readonly ColourGroup[] = [
  { heading: 'Light', options: standardOptions('soft', 'light', 'hex') },
  { heading: 'Dark', options: standardOptions('strong', 'light', 'hex') },
];

export function OfficeColourControl({
  id,
  label,
  icon,
  colour,
  value,
  tabIndex,
  className,
}: {
  // The control's id, which the toolbar finds it by.
  id: string;
  label: string;
  icon: readonly IconPrim[];
  colour: OfficeColour;
  // The colour at the caret, as `read` gave it when the toolbar last looked.
  value: string | null | undefined;
  tabIndex: number;
  className: string;
}) {
  const yours = useDocumentColours();
  const shown = value === undefined ? colour.none : (value ?? undefined);
  return (
    <ColourSwatchButton
      label={label}
      swatch={shown ?? 'transparent'}
      none={shown === undefined}
      value={value === undefined ? LEADING_ID : value}
      leading={[noColour(LEADING_ID, colour.leading)]}
      theme={NO_THEME}
      standard={OFFICE_COLOUR_ROWS}
      yours={yours}
      preserveFocus
      triggerProps={{ tabIndex, 'data-office-control': id }}
      className={className}
      onPick={(picked) => colour.set(picked === LEADING_ID ? null : picked)}
    >
      <span className="flex flex-col items-center">
        <Glyph size={16} units={24}>
          <Prims prims={icon} />
        </Glyph>
        <span
          aria-hidden="true"
          data-colour-bar={shown ?? 'none'}
          className={`mt-px h-1 w-4 rounded-[1px] ${shown === undefined ? 'border border-(--office-line)' : ''}`}
          style={shown === undefined ? undefined : { background: shown }}
        />
      </span>
    </ColourSwatchButton>
  );
}
