'use client';

// File > Page setup (docs/specs/034-text-documents/page-layout.md "Page setup", "Pageless"): the Pages tab's orientation,
// paper size, page colour and four margins in the person's unit, and the Pageless tab's background colour, laid out as
// Google's dialog has them. The tab chosen is the format OK leaves the document in; Set as default keeps it as the
// person's default and leaves the dialog open.
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
import { OfficeDialogTabs, officeTabPanel } from '@/components/office/OfficeDialogTabs';
import type { DefaultPage } from '@/lib/text-document/text-document-page-defaults';
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
type Tab = 'pages' | 'pageless';
const TABS: readonly (readonly [Tab, string])[] = [
  ['pages', 'Pages'],
  ['pageless', 'Pageless'],
];
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
  pageless,
  unit,
  onApply,
  onSaveDefault,
  onClose,
}: {
  open: boolean;
  // The page setup there is now.
  setup: PageSetup;
  // The document is pageless now: the Pageless tab opens chosen.
  pageless: boolean;
  unit: IndentUnit;
  onApply: (page: DefaultPage) => void;
  onSaveDefault: (page: DefaultPage) => void;
  onClose: () => void;
}) {
  const ids = { tabs: useId(), paper: useId(), orientation: useId() };
  const [tab, setTab] = useState<Tab>(pageless ? 'pageless' : 'pages');
  const initial = useMemo(() => draftOf(setup, unit), [setup, unit]);
  const [draft, setDraft] = useState(initial);
  // What Set as default last kept, so the button reads Saved until a field or the tab changes.
  const [saved, setSaved] = useState<{ draft: Draft; tab: Tab } | null>(null);
  const isSaved = saved?.draft === draft && saved.tab === tab;
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
    return coloured({
      ...PageSetup.oriented(
        { ...setup, width: draft.short, height: draft.long },
        draft.orientation,
      ),
      margins: margins as unknown as Margins,
    });
  };
  // The Pageless tab changes only the colour (and the format): the rest as the document has it.
  const coloured = (base: PageSetup): PageSetup => {
    const { pageColor: _colour, ...rest } = base;
    return {
      ...rest,
      ...(draft.colour.toLowerCase() === WHITE ? {} : { pageColor: draft.colour.toLowerCase() }),
    };
  };
  const chosen = (): DefaultPage =>
    tab === 'pages'
      ? { setup: built(), pageless: false }
      : { setup: coloured(setup), pageless: true };
  const ready = tab === 'pageless' || valid;
  const change = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const paper = PageSetup.paperOf({ ...setup, width: draft.short, height: draft.long }) ?? CUSTOM;

  return (
    <OfficeDialog
      open={open}
      onClose={onClose}
      title="Page setup"
      primary={{ label: 'OK', disabled: !ready, onPress: () => onApply(chosen()) }}
      secondary={{
        label: isSaved ? SAVED_AS_DEFAULT : 'Set as default',
        disabled: !ready,
        onPress: () => {
          onSaveDefault(chosen());
          setSaved({ draft, tab });
        },
      }}
    >
      <OfficeDialogTabs
        id={ids.tabs}
        label="Page format"
        tabs={TABS}
        value={tab}
        onChange={setTab}
      />
      {tab === 'pageless' ? (
        <div {...officeTabPanel(ids.tabs, 'pageless')} className="flex flex-col gap-5 pt-1">
          <p className="text-sm text-(--office-muted)">
            One continuous page, without page breaks, headers or footers.
          </p>
          <div className="flex flex-col">
            <span aria-hidden="true" className={HEADING}>
              Background colour
            </span>
            <OfficeDialogColourField
              label="Background colour"
              value={draft.colour}
              className={CONTROL}
              onPick={(colour) => change({ colour })}
            />
          </div>
        </div>
      ) : (
        <div
          {...officeTabPanel(ids.tabs, 'pages')}
          className="grid gap-x-10 gap-y-5 pt-1 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
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
            <legend className={HEADING}>
              Margins ({unit === 'in' ? 'inches' : 'centimetres'})
            </legend>
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
      )}
      <p role="status" className="sr-only">
        {isSaved ? 'Saved as your default page setup.' : ''}
      </p>
    </OfficeDialog>
  );
}
