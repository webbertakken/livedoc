// What File › Settings offers and checks (docs/specs/029-sheets/settings.md "Spreadsheet settings"): the locales
// (D510), the time zones as Google labels them (D511), the documents Cards From names (D512), the recalculation modes,
// and a draft's iteration fields read back to settings or the field that is out of range. Pure, so the dialog only
// draws it.
import type { DocumentSummary } from '@livedoc/api-schema';
import {
  WORKBOOK_ITERATIONS_MAX,
  type WorkbookRecalc,
  type WorkbookSettings,
} from '@livedoc/sheets';

export type SettingsOption = { value: string; label: string };

/** The locales offered (D510): common ones, each named by Intl. Safe to grow; never shrink one a workbook holds. */
export const SPREADSHEET_LOCALES: readonly string[] = [
  'ar-SA',
  'cs-CZ',
  'da-DK',
  'de-AT',
  'de-CH',
  'de-DE',
  'el-GR',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-IE',
  'en-IN',
  'en-NZ',
  'en-US',
  'en-ZA',
  'es-AR',
  'es-ES',
  'es-MX',
  'fi-FI',
  'fr-BE',
  'fr-CA',
  'fr-CH',
  'fr-FR',
  'he-IL',
  'hi-IN',
  'hu-HU',
  'id-ID',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nb-NO',
  'nl-BE',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'sv-SE',
  'th-TH',
  'tr-TR',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
];

const LOCALE_NAMES = new Intl.DisplayNames(['en'], {
  type: 'language',
  languageDisplay: 'standard',
});

function localeLabel(tag: string): string {
  try {
    return LOCALE_NAMES.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The locales by their English names, the workbook's own listed first when it is none of them. */
export function localeOptions(current: string): SettingsOption[] {
  const listed = SPREADSHEET_LOCALES.map((value) => ({ value, label: localeLabel(value) })).sort(
    (a, b) => a.label.localeCompare(b.label, 'en'),
  );
  return SPREADSHEET_LOCALES.includes(current)
    ? listed
    : [{ value: current, label: localeLabel(current) }, ...listed];
}

/** A zone's offset from UTC now, in minutes; 0 for one the runtime cannot read. */
function offsetMinutes(zone: string, at: Date): number {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '');
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  } catch {
    return 0;
  }
}

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `(GMT${sign}${hh}:${mm})`;
}

/** A zone's city as Google names it: its last part, underscores as spaces ("America/New_York" is "New York"). */
const cityOf = (zone: string) => zone.split('/').at(-1)!.replace(/_/g, ' ');

/** Every zone `zones` holds, labelled `(GMT+01:00) Amsterdam` at `at` and ordered by offset then city (D511). */
export function timeZoneOptions(
  zones: readonly string[],
  current: string,
  at: Date,
): SettingsOption[] {
  const all = zones.includes(current) ? zones : [current, ...zones];
  return all
    .map((zone) => ({ zone, offset: offsetMinutes(zone, at), city: cityOf(zone) }))
    .sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city, 'en'))
    .map(({ zone, offset, city }) => ({ value: zone, label: `${offsetText(offset)} ${city}` }));
}

/** The zones the browser knows; UTC alone where it cannot list them. */
export function browserTimeZones(): readonly string[] {
  return typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC'];
}

export const RECALC_OPTIONS: readonly (SettingsOption & { value: WorkbookRecalc })[] = [
  { value: 'change', label: 'On Change' },
  { value: 'minute', label: 'On Change and Every Minute' },
  { value: 'hour', label: 'On Change and Every Hour' },
];

/** The value Cards From holds for none. */
export const NO_CARDS_DOCUMENT = '';
export const ANOTHER_DOCUMENT = 'Another Document';

/** Cards From's choices (D512): None, then the person's own documents that are neither spreadsheets nor text
 * documents, newest first; a named document not among them as Another Document, so it stays chosen. */
export function cardsDocumentOptions(
  documents: readonly DocumentSummary[],
  current: string | undefined,
  self: string,
): SettingsOption[] {
  const own = documents
    .filter((d) => !d.spreadsheet && !d.textDocument && d.id !== self)
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((d) => ({ value: d.id, label: d.name.trim() || 'Untitled document' }));
  const kept =
    current && !own.some((o) => o.value === current)
      ? [{ value: current, label: ANOTHER_DOCUMENT }]
      : [];
  return [{ value: NO_CARDS_DOCUMENT, label: 'None' }, ...kept, ...own];
}

/** The dialog's draft: the settings, with the iteration numbers as typed. */
export type SettingsDraft = {
  settings: WorkbookSettings;
  max: string;
  threshold: string;
};

export const MAX_ITERATIONS_INVALID = 'Enter a whole number from 1 to 1,000';
export const THRESHOLD_INVALID = 'Enter a number of 0 or more';

export const SettingsDraft = {
  of: (settings: WorkbookSettings): SettingsDraft => ({
    settings,
    max: String(settings.iterate.max),
    threshold: String(settings.iterate.threshold),
  }),

  /** What is wrong with each iteration field; none while iterative calculation is off. */
  problems: (draft: SettingsDraft): { max?: string; threshold?: string } => {
    if (!draft.settings.iterate.on) return {};
    const max = Number(draft.max.trim());
    const threshold = Number(draft.threshold.trim());
    const maxOk =
      draft.max.trim() !== '' &&
      Number.isInteger(max) &&
      max >= 1 &&
      max <= WORKBOOK_ITERATIONS_MAX;
    const thresholdOk =
      draft.threshold.trim() !== '' && Number.isFinite(threshold) && threshold >= 0;
    return {
      ...(maxOk ? {} : { max: MAX_ITERATIONS_INVALID }),
      ...(thresholdOk ? {} : { threshold: THRESHOLD_INVALID }),
    };
  },

  /** The settings to save, or null while a field is out of range. Off, the iteration numbers stay as they were. */
  settings: (draft: SettingsDraft): WorkbookSettings | null => {
    const { settings } = draft;
    const wrong = SettingsDraft.problems(draft);
    if (wrong.max || wrong.threshold) return null;
    if (!settings.iterate.on) return settings;
    return {
      ...settings,
      iterate: {
        on: true,
        max: Number(draft.max.trim()),
        threshold: Number(draft.threshold.trim()),
      },
    };
  },
} as const;
