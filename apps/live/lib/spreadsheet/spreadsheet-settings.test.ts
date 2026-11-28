// docs/specs/029-sheets/settings.md "Spreadsheet settings" (D510 to D512): what File › Settings offers and checks.
import { describe, expect, it } from 'vitest';
import type { DocumentSummary } from '@livedoc/api-schema';
import { WorkbookRecord } from '@livedoc/sheets';
import {
  ANOTHER_DOCUMENT,
  cardsDocumentOptions,
  localeOptions,
  MAX_ITERATIONS_INVALID,
  SettingsDraft,
  SPREADSHEET_LOCALES,
  THRESHOLD_INVALID,
  timeZoneOptions,
} from './spreadsheet-settings';

const settings = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' }).settings;

const doc = (id: string, savedAt: number, extra: Partial<DocumentSummary> = {}) =>
  ({ id, name: id.toUpperCase(), savedAt, ...extra }) as DocumentSummary;

describe('localeOptions', () => {
  it('names each locale in English, ordered by name', () => {
    const options = localeOptions('en-GB');
    expect(options).toHaveLength(SPREADSHEET_LOCALES.length);
    expect(options.find((o) => o.value === 'en-GB')!.label).toBe('English (United Kingdom)');
    expect(options.find((o) => o.value === 'nl-NL')!.label).toBe('Dutch (Netherlands)');
    const labels = options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('lists a workbook’s own locale first when it is not offered', () => {
    expect(localeOptions('ga-IE')[0]).toEqual({ value: 'ga-IE', label: 'Irish (Ireland)' });
  });
});

describe('timeZoneOptions', () => {
  const winter = new Date(Date.UTC(2026, 0, 15));
  it('labels each zone by its offset now and its city, ordered by offset then city', () => {
    const options = timeZoneOptions(
      ['Europe/Amsterdam', 'America/New_York', 'UTC', 'Asia/Kolkata'],
      'UTC',
      winter,
    );
    expect(options.map((o) => o.label)).toEqual([
      '(GMT-05:00) New York',
      '(GMT+00:00) UTC',
      '(GMT+01:00) Amsterdam',
      '(GMT+05:30) Kolkata',
    ]);
  });

  it('follows daylight saving, and keeps a zone the list lacks', () => {
    const summer = new Date(Date.UTC(2026, 6, 15));
    const options = timeZoneOptions(['UTC'], 'Europe/Amsterdam', summer);
    expect(options.map((o) => o.label)).toEqual(['(GMT+00:00) UTC', '(GMT+02:00) Amsterdam']);
  });
});

describe('cardsDocumentOptions', () => {
  const documents = [
    doc('old', 1),
    doc('sheet', 5, { spreadsheet: true }),
    doc('text', 6, { textDocument: true }),
    doc('new', 9),
    doc('self', 10),
  ];

  it('offers None, then the person’s own Plan documents newest first, never this one', () => {
    expect(cardsDocumentOptions(documents, undefined, 'self')).toEqual([
      { value: '', label: 'None' },
      { value: 'new', label: 'NEW' },
      { value: 'old', label: 'OLD' },
    ]);
  });

  it('keeps a named document that is not theirs as Another Document', () => {
    expect(cardsDocumentOptions(documents, 'theirs', 'self')[1]).toEqual({
      value: 'theirs',
      label: ANOTHER_DOCUMENT,
    });
    expect(cardsDocumentOptions(documents, 'old', 'self')).toHaveLength(3);
  });
});

describe('SettingsDraft', () => {
  const on = { ...settings, iterate: { on: true, max: 50, threshold: 0.05 } };

  it('reads the iteration numbers back as typed', () => {
    const draft = { ...SettingsDraft.of(on), max: ' 100 ', threshold: '0.001' };
    expect(SettingsDraft.settings(draft)).toEqual({
      ...on,
      iterate: { on: true, max: 100, threshold: 0.001 },
    });
  });

  it.each([
    ['0', '0.05', { max: MAX_ITERATIONS_INVALID }],
    ['1001', '0.05', { max: MAX_ITERATIONS_INVALID }],
    ['2.5', '0.05', { max: MAX_ITERATIONS_INVALID }],
    ['', '0.05', { max: MAX_ITERATIONS_INVALID }],
    ['5', '-1', { threshold: THRESHOLD_INVALID }],
    ['5', 'x', { threshold: THRESHOLD_INVALID }],
  ])('refuses %s iterations at threshold %s', (max, threshold, problems) => {
    const draft = { ...SettingsDraft.of(on), max, threshold };
    expect(SettingsDraft.problems(draft)).toEqual(problems);
    expect(SettingsDraft.settings(draft)).toBeNull();
  });

  it('checks nothing with iterative calculation off, keeping the numbers as they were', () => {
    const draft = { ...SettingsDraft.of(settings), max: 'x' };
    expect(SettingsDraft.problems(draft)).toEqual({});
    expect(SettingsDraft.settings(draft)).toEqual(settings);
  });
});
