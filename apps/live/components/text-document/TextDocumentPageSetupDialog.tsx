'use client';

// File > Page setup (docs/specs/034-text-documents/page-layout.md "Page setup"), its Pages tab: orientation, paper size
// and page colour, and the four margins in the person's unit, laid out as Google's dialog has them. Nothing changes
// until OK; Set as default keeps the tab as the person's default page setup and leaves the dialog open.
import { useId, useMemo, useState } from 'react';
import {
  MIN_TEXT_SIDE_PT,
  PAPER,
  PAPER_ORDER,
  PageSetup,
  type Margins,
  type Orientation,
  type PaperName,
} from '@livedoc/text-documents';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { OfficeDialogColourField } from '@/components/office/OfficeDialogColourField';
import { ptOf, readIndentField, unitOf, type IndentUnit } from '@/lib/text-document/indent-units';
import { TextDocumentLengthField } from './TextDocumentLengthField';

export const PAPER_LABELS: Record<PaperName, string> = {
  letter: 'Letter',
  tabloid: 'Tabloid',
  legal: 'Legal',
  statement: 'Statement',
  executive: 'Executive',
  folio: 'Folio',
  a3: 'A3',
  a4: 'A4',
  a5: 'A5',
  b4: 'B4',
  b5: 'B5',
};

export const NO_ROOM_FOR_TEXT = 'Margins leave too little room for text.';
export const SAVED_AS_DEFAULT = 'Saved as default';

const WHITE = '#ffffff';
const CUSTOM = 'custom';
const SIDES: readonly { side: keyof Margins; label: string }[] = [
  { side: 'top', label: 'Top' },
  { side: 'bottom', label: 'Bottom' },
  { side: 'left', label: 'Left' },
  { side: 'right', label: 'Right' },
];
const ORIENTATIONS: readonly { value: Orientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const CONTROL =
  'h-9 rounded border border-(--office-line) bg-transparent px-3 text-sm text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus)';
const RADIO = 'size-4 shrink-0 accent-(--office-primary)';
const HEADING = 'mb-2 text-sm font-medium';

/** A paper's sides as its option reads them: "8.5 × 11 in". */
export const sidesText = (width: number, height: number, unit: IndentUnit): string =>
  `${unitOf(Math.min(width, height), unit)} × ${unitOf(Math.max(width, height), unit)} ${unit}`;

type Draft = {
  orientation: Orientation;
  // The page's sides, portrait (shorter across): a paper's, or the size a file brought.
  short: number;
  long: number;
  margins: Record<keyof Margins, string>;
  colour: string;
};

function draftOf(setup: PageSetup, unit: IndentUnit): Draft {
  return {
    orientation: setup.width > setup.height ? 'landscape' : 'portrait',
    short: Math.min(setup.width, setup.height),
    long: Math.max(setup.width, setup.height),
    margins: {
      top: String(unitOf(setup.margins.top, unit)),
      bottom: String(unitOf(setup.margins.bottom, unit)),
      left: String(unitOf(setup.margins.left, unit)),
      right: String(unitOf(setup.margins.right, unit)),
    },
    colour: setup.pageColor ?? WHITE,
  };
}

export function TextDocumentPageSetupDialog({
  open,
  setup,
  unit,
  onApply,
  onSaveDefault,
  onClose,
}: {
  open: boolean;
  // The page setup there is now.
  setup: PageSetup;
  unit: IndentUnit;
  onApply: (setup: PageSetup) => void;
  onSaveDefault: (setup: PageSetup) => void;
  onClose: () => void;
}) {
  const ids = { paper: useId(), orientation: useId() };
  const initial = useMemo(() => draftOf(setup, unit), [setup, unit]);
  const [draft, setDraft] = useState(initial);
  // The draft Set as default last kept, so the button reads Saved until a field changes.
  const [saved, setSaved] = useState<Draft | null>(null);
  // A file's size that is none of Google's stays on offer, first, until another paper is picked.
  const custom = useMemo(() => PageSetup.paperOf(setup) === null, [setup]);

  // A margin left as shown keeps its exact length (a file's 0.984 in shows as 0.98); a typed one is read in the unit.
  const marginPt = (side: keyof Margins): number | null => {
    const text = draft.margins[side];
    if (text === initial.margins[side]) return setup.margins[side];
    const value = readIndentField(text, unit);
    return typeof value === 'number' ? ptOf(value, unit) : null;
  };
  const margins = Object.fromEntries(SIDES.map(({ side }) => [side, marginPt(side)])) as Record<
    keyof Margins,
    number | null
  >;
  const read = Object.values(margins).every((m) => m !== null);
  const across = draft.orientation === 'landscape' ? draft.long : draft.short;
  const down = draft.orientation === 'landscape' ? draft.short : draft.long;
  const noRoomAcross = read && across - margins.left! - margins.right! < MIN_TEXT_SIDE_PT;
  const noRoomDown = read && down - margins.top! - margins.bottom! < MIN_TEXT_SIDE_PT;
  const problemOf = (side: keyof Margins) =>
    (side === 'left' || side === 'right' ? noRoomAcross : noRoomDown) ? NO_ROOM_FOR_TEXT : null;
  const valid = read && !noRoomAcross && !noRoomDown;

  const built = (): PageSetup => {
    const { pageColor: _colour, ...rest } = setup;
    return {
      ...PageSetup.oriented({ ...rest, width: draft.short, height: draft.long }, draft.orientation),
      margins: margins as unknown as Margins,
      ...(draft.colour.toLowerCase() === WHITE ? {} : { pageColor: draft.colour.toLowerCase() }),
    };
  };
  const change = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const paper = PageSetup.paperOf({ ...setup, width: draft.short, height: draft.long }) ?? CUSTOM;

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Page setup"
      primary={{ label: 'OK', disabled: !valid, onPress: () => onApply(built()) }}
      secondary={{
        label: saved === draft ? SAVED_AS_DEFAULT : 'Set as default',
        disabled: !valid,
        onPress: () => {
          onSaveDefault(built());
          setSaved(draft);
        },
      }}
    >
      <div className="grid gap-x-10 gap-y-5 pt-1 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-5">
          <fieldset>
            <legend className={HEADING}>Orientation</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {ORIENTATIONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={ids.orientation}
                    className={RADIO}
                    checked={draft.orientation === value}
                    onChange={() => change({ orientation: value })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col">
            <label htmlFor={ids.paper} className={HEADING}>
              Paper size
            </label>
            <select
              id={ids.paper}
              value={paper}
              onChange={(e) => {
                const name = e.target.value as PaperName | typeof CUSTOM;
                change(
                  name === CUSTOM
                    ? { short: initial.short, long: initial.long }
                    : { short: PAPER[name].width, long: PAPER[name].height },
                );
              }}
              className={`${CONTROL} w-full max-w-64 cursor-pointer [&>option]:bg-(--office-menu)`}
            >
              {custom ? (
                <option value={CUSTOM}>
                  Custom ({sidesText(setup.width, setup.height, unit)})
                </option>
              ) : null}
              {PAPER_ORDER.map((name) => (
                <option key={name} value={name}>
                  {PAPER_LABELS[name]} ({sidesText(PAPER[name].width, PAPER[name].height, unit)})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <span aria-hidden="true" className={HEADING}>
              Page colour
            </span>
            <OfficeDialogColourField
              label="Page colour"
              value={draft.colour}
              className={CONTROL}
              onPick={(colour) => change({ colour })}
            />
          </div>
        </div>
        <fieldset>
          <legend className={HEADING}>Margins ({unit === 'in' ? 'inches' : 'centimetres'})</legend>
          <div className="grid grid-cols-[auto_auto] items-start gap-x-4 gap-y-3">
            {SIDES.map(({ side, label }) => (
              <div key={side} className="contents">
                <span className="pt-2 text-sm">{label}</span>
                <TextDocumentLengthField
                  label={`${label} margin`}
                  value={draft.margins[side]}
                  unit={unit}
                  problem={problemOf(side)}
                  onChange={(text) => change({ margins: { ...draft.margins, [side]: text } })}
                />
              </div>
            ))}
          </div>
        </fieldset>
      </div>
      <p role="status" className="sr-only">
        {saved === draft ? 'Saved as your default page setup.' : ''}
      </p>
    </OfficeDialog>
  );
}
