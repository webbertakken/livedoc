'use client';

// A colour in an office dialog (docs/specs/004-interface-design/colour-picker.md "Skins", the swatch skin): a field
// showing the colour's chip, opening the one colour picker with the office colour rows and the document's own
// colours. A leading no-colour option ("None") is `OFFICE_NO_COLOUR`; a value null shows "Mixed".
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { noColour } from '@/components/colour/colour-options';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { OFFICE_COLOUR_ROWS } from './OfficeColourControl';

/** The value of the leading no-colour option. */
export const OFFICE_NO_COLOUR = 'none';
const NO_THEME: readonly never[] = [];

export function OfficeDialogColourField({
  label,
  value,
  leading,
  className,
  onPick,
}: {
  label: string;
  // `#rrggbb`, OFFICE_NO_COLOUR (the leading option), or null where what the dialog sets differs.
  value: string | null;
  // The leading no-colour option's name; none offers no such option.
  leading?: string;
  // The dialog's control look.
  className: string;
  onPick: (value: string) => void;
}) {
  const yours = useDocumentColours();
  const none = value === OFFICE_NO_COLOUR || value === null;
  return (
    <ColourSwatchButton
      label={label}
      swatch={none ? 'transparent' : value}
      none={none}
      value={value ?? ''}
      leading={leading ? [noColour(OFFICE_NO_COLOUR, leading)] : []}
      theme={NO_THEME}
      standard={OFFICE_COLOUR_ROWS}
      yours={yours}
      className={`${className} flex w-28 items-center gap-2`}
      onPick={onPick}
    >
      <span
        aria-hidden="true"
        data-colour-chip={none ? 'none' : value}
        className="size-4 rounded-control border border-(--office-line)"
        style={none ? undefined : { background: value }}
      />
      <span className="text-supporting text-(--office-muted)">
        {value === null ? 'Mixed' : value === OFFICE_NO_COLOUR ? (leading ?? '') : ''}
      </span>
    </ColourSwatchButton>
  );
}
