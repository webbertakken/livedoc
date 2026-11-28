'use client';

// File › Settings (docs/specs/029-sheets/settings.md "Spreadsheet settings"): Google's Settings for This Spreadsheet,
// General (Locale, Time Zone, Display Language, Cards From) and Calculation (Recalculation, Iterative Calculation)
// tabs. It opens with the settings as they are; nothing changes until Save Settings, which waits on a field out of
// range and stays open, saying so, when the save fails.
import { useId, useMemo, useState } from 'react';
import type { WorkbookRecalc, WorkbookSettings } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { OfficeDialogSelect } from '@/components/office/OfficeDialogFields';
import { OfficeDialogTabs, officeTabPanel } from '@/components/office/OfficeDialogTabs';
import {
  browserTimeZones,
  localeOptions,
  NO_CARDS_DOCUMENT,
  RECALC_OPTIONS,
  SettingsDraft,
  timeZoneOptions,
  type SettingsOption,
} from '@/lib/spreadsheet/spreadsheet-settings';

export const SETTINGS_NOT_SAVED = 'The settings couldn’t be saved. Try again.';

type Tab = 'general' | 'calculation';
const TABS: readonly [Tab, string][] = [
  ['general', 'General'],
  ['calculation', 'Calculation'],
];

// What sits under a checkbox's words starts where they do: the box (16 px) and its gap (12 px).
const UNDER_CHECKBOX = { paddingInlineStart: 28 } as const;

const FIELD =
  'h-field w-28 rounded-control border border-(--office-line) bg-transparent px-2 text-body text-(--office-ink) outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) aria-invalid:border-(--office-error)';

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly SettingsOption[];
  onChange: (value: string) => void;
}) {
  const labels = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  return (
    <OfficeDialogSelect
      label={label}
      value={value}
      options={options.map((o) => o.value)}
      labelOf={(v) => labels.get(v) ?? v}
      onChange={onChange}
      width="w-72 max-w-full"
    />
  );
}

function NumberField({
  label,
  value,
  problem,
  onChange,
}: {
  label: string;
  value: string;
  problem: string | undefined;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-body text-(--office-muted)">
        <span>{label}</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? id : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={FIELD}
        />
      </label>
      {problem ? (
        <p id={id} className="text-body text-(--office-error)">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

export function SpreadsheetSettingsDialog({
  settings,
  cardsOptions,
  onSave,
  onClose,
}: {
  // The settings as they are when it opens; mounted only while open, so each opening starts from them.
  settings: WorkbookSettings;
  // Cards From's choices: None, then the documents it may name (D512).
  cardsOptions: readonly SettingsOption[];
  // Saves the settings whole; false when the api refused them or could not be reached.
  onSave: (settings: WorkbookSettings) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('general');
  const [draft, setDraft] = useState(() => SettingsDraft.of(settings));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // The offsets the zones are labelled by are the ones in force as it opens (D511).
  const [openedAt] = useState(() => new Date());
  const locales = useMemo(() => localeOptions(settings.locale), [settings.locale]);
  const zones = useMemo(
    () => timeZoneOptions(browserTimeZones(), settings.timeZone, openedAt),
    [settings.timeZone, openedAt],
  );
  const problems = SettingsDraft.problems(draft);
  const ready = SettingsDraft.settings(draft);
  const set = (next: Partial<WorkbookSettings>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...next } }));
  const cards = draft.settings.cardsDocument ?? NO_CARDS_DOCUMENT;
  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setFailed(false);
    const saved = await onSave(ready);
    setSaving(false);
    if (saved) onClose();
    else setFailed(true);
  };
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Settings for This Spreadsheet"
      primary={{
        label: saving ? 'Saving…' : 'Save Settings',
        disabled: saving || !ready,
        onPress: () => void save(),
      }}
    >
      <div data-spreadsheet-settings="" className="flex flex-col gap-1">
        <OfficeDialogTabs id={id} label="Settings" tabs={TABS} value={tab} onChange={setTab} />
        {tab === 'general' ? (
          <div {...officeTabPanel(id, 'general')} className="flex flex-col gap-4">
            <Choice
              label="Locale"
              value={draft.settings.locale}
              options={locales}
              onChange={(locale) => set({ locale })}
            />
            <Choice
              label="Time Zone"
              value={draft.settings.timeZone}
              options={zones}
              onChange={(timeZone) => set({ timeZone })}
            />
            <OfficeDialogSelect
              label="Display Language"
              value="English"
              options={['English']}
              onChange={() => {}}
              width="w-72 max-w-full"
            />
            <Choice
              label="Cards From"
              value={cards}
              options={cardsOptions}
              onChange={(next) =>
                setDraft((d) => {
                  const { cardsDocument: _, ...rest } = d.settings;
                  return {
                    ...d,
                    settings: next === NO_CARDS_DOCUMENT ? rest : { ...rest, cardsDocument: next },
                  };
                })
              }
            />
          </div>
        ) : (
          <div {...officeTabPanel(id, 'calculation')} className="flex flex-col gap-4">
            <Choice
              label="Recalculation"
              value={draft.settings.recalc}
              options={RECALC_OPTIONS}
              onChange={(recalc) => set({ recalc: recalc as WorkbookRecalc })}
            />
            <label className="flex items-center gap-3 text-body">
              <input
                type="checkbox"
                className="size-icon-row shrink-0 accent-(--office-primary)"
                checked={draft.settings.iterate.on}
                onChange={(e) =>
                  set({ iterate: { ...draft.settings.iterate, on: e.target.checked } })
                }
              />
              Iterative Calculation
            </label>
            {draft.settings.iterate.on ? (
              <div className="flex flex-col gap-3" style={UNDER_CHECKBOX}>
                <NumberField
                  label="Max Number of Iterations"
                  value={draft.max}
                  problem={problems.max}
                  onChange={(max) => setDraft((d) => ({ ...d, max }))}
                />
                <NumberField
                  label="Threshold"
                  value={draft.threshold}
                  problem={problems.threshold}
                  onChange={(threshold) => setDraft((d) => ({ ...d, threshold }))}
                />
              </div>
            ) : null}
          </div>
        )}
        {failed ? (
          <p role="alert" className="pt-3 text-body text-(--office-error)">
            {SETTINGS_NOT_SAVED}
          </p>
        ) : null}
      </div>
    </OfficeDialog>
  );
}
