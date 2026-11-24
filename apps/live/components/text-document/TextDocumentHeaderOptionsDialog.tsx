'use client';

// Format > Headers & footers and the bar's Header format (docs/specs/034-text-documents/page-layout.md "Editing headers
// and footers"): the header and footer margins in the person's unit, refused past the page's height less 1 in, the
// section's Different first page and Different odd and even, and Apply to while there are sections; nothing changes
// until Apply.
import { useId, useState } from 'react';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { ptOf, readIndentField, unitOf, type IndentUnit } from '@/lib/text-document/indent-units';
import {
  HEADER_OPTIONS_SCOPE_LABELS,
  type HeaderOptions,
  type HeaderOptionsScope,
} from '@/lib/text-document/text-document-header-options';
import { TextDocumentLengthField } from './TextDocumentLengthField';

const CONTROL =
  'h-prominent rounded-control border border-(--office-line) bg-transparent px-3 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';
const HEADING = 'mb-2 text-body font-medium';
const CHECK = 'size-4 shrink-0 accent-(--office-primary)';

type Margin = 'header' | 'footer';
const MARGINS: readonly { margin: Margin; label: string }[] = [
  { margin: 'header', label: 'Header' },
  { margin: 'footer', label: 'Footer' },
];
const SWITCHES: readonly { name: 'differentFirst' | 'differentOddEven'; label: string }[] = [
  { name: 'differentFirst', label: 'Different first page' },
  { name: 'differentOddEven', label: 'Different odd and even' },
];

/** The message a margin past the most reads, in the person's unit. */
export const marginTooLarge = (mostPt: number, unit: IndentUnit): string =>
  `Enter a number from 0 to ${unitOf(mostPt, unit)}.`;

export function TextDocumentHeaderOptionsDialog({
  open,
  options,
  unit,
  scopes,
  mostOf,
  onApply,
  onClose,
}: {
  open: boolean;
  // The section's options now.
  options: HeaderOptions;
  unit: IndentUnit;
  // What Apply to offers; This section first, chosen when it opens. One choice offers none.
  scopes: readonly HeaderOptionsScope[];
  // The most a margin takes over a scope's sections (pt).
  mostOf: (scope: HeaderOptionsScope) => number;
  onApply: (options: HeaderOptions, scope: HeaderOptionsScope) => void;
  onClose: () => void;
}) {
  const ids = { scope: useId(), first: useId(), oddEven: useId() };
  const [scope, setScope] = useState<HeaderOptionsScope>(scopes[0] ?? 'section');
  const shown = {
    header: String(unitOf(options.header, unit)),
    footer: String(unitOf(options.footer, unit)),
  };
  const [margins, setMargins] = useState(shown);
  const [switches, setSwitches] = useState({
    differentFirst: options.differentFirst,
    differentOddEven: options.differentOddEven,
  });
  const most = mostOf(scope);

  // A margin left as shown keeps its exact length; a typed one is read in the unit.
  const marginPt = (margin: Margin): number | null => {
    if (margins[margin] === shown[margin]) return options[margin];
    const value = readIndentField(margins[margin], unit);
    return typeof value === 'number' ? ptOf(value, unit) : null;
  };
  const read = { header: marginPt('header'), footer: marginPt('footer') };
  const tooLarge = (margin: Margin) => read[margin] !== null && read[margin] > most + 0.005;
  const valid = MARGINS.every(({ margin }) => read[margin] !== null && !tooLarge(margin));

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Headers & footers"
      primary={{
        label: 'Apply',
        disabled: !valid,
        onPress: () => onApply({ header: read.header!, footer: read.footer!, ...switches }, scope),
      }}
    >
      <div className="flex flex-col gap-6 pt-1">
        <fieldset>
          <legend className={HEADING}>Margins ({unit === 'in' ? 'inches' : 'centimetres'})</legend>
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            {MARGINS.map(({ margin, label }) => (
              <div key={margin} className="flex items-start gap-3">
                <span aria-hidden="true" className="w-14 pt-2 text-body">
                  {label}
                </span>
                <TextDocumentLengthField
                  label={label}
                  value={margins[margin]}
                  unit={unit}
                  problem={tooLarge(margin) ? marginTooLarge(most, unit) : null}
                  onChange={(text) => setMargins((m) => ({ ...m, [margin]: text }))}
                />
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className={HEADING}>Layout</legend>
          <div className="flex flex-col gap-2">
            {SWITCHES.map(({ name, label }) => (
              <label
                key={name}
                htmlFor={name === 'differentFirst' ? ids.first : ids.oddEven}
                className="flex cursor-pointer items-center gap-3 text-body"
              >
                <input
                  id={name === 'differentFirst' ? ids.first : ids.oddEven}
                  type="checkbox"
                  className={CHECK}
                  checked={switches[name]}
                  onChange={(e) => setSwitches((s) => ({ ...s, [name]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {scopes.length > 1 ? (
          <div className="flex flex-col">
            <label htmlFor={ids.scope} className={HEADING}>
              Apply to
            </label>
            <select
              id={ids.scope}
              value={scope}
              onChange={(e) => setScope(e.target.value as HeaderOptionsScope)}
              className={`${CONTROL} w-full max-w-64 cursor-pointer [&>option]:bg-(--office-menu)`}
            >
              {scopes.map((choice) => (
                <option key={choice} value={choice}>
                  {HEADER_OPTIONS_SCOPE_LABELS[choice]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
