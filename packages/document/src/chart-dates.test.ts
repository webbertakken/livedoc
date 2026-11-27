// docs/specs/009-elements/pie-chart.md "Timeline" (D372): a category is a date when it is ISO, in UTC; a sheet's dated
// label column is read as ISO dates from its serial numbers.
import { describe, expect, it } from 'vitest';
import { isoDateTime, serialDateText, utcTime } from './chart-dates';

describe('serialDateText', () => {
  it('writes a whole day as a date, a part of one with its time', () => {
    expect(serialDateText(43101)).toBe('2018-01-01');
    expect(serialDateText(43101.5)).toBe('2018-01-01T12:00');
    expect(serialDateText(43101.5 + 15 / 86400)).toBe('2018-01-01T12:00:15');
    expect(serialDateText(25569)).toBe('1970-01-01');
  });
});

describe('isoDateTime', () => {
  it('reads an ISO date or date and time as UTC milliseconds', () => {
    expect(isoDateTime('2018-01-01')).toBe(Date.UTC(2018, 0, 1));
    expect(isoDateTime(' 2018-01-01T12:30 ')).toBe(Date.UTC(2018, 0, 1, 12, 30));
    expect(isoDateTime('2018-01-01 12:30:15')).toBe(Date.UTC(2018, 0, 1, 12, 30, 15));
  });

  it('reads nothing else, nor a day that does not exist', () => {
    expect(isoDateTime('1/1/2018')).toBeNull();
    expect(isoDateTime('Jan')).toBeNull();
    expect(isoDateTime('')).toBeNull();
    expect(isoDateTime('2018-02-30')).toBeNull();
    expect(isoDateTime('2018-01-01T25:00')).toBeNull();
  });

  it('reads back what serialDateText writes', () => {
    for (const s of [43101, 43101.25, 0.5])
      expect(isoDateTime(serialDateText(s))).toBe(Math.round((s - 25569) * 86400000));
  });
});

describe('utcTime', () => {
  it('reads years under 100 as written', () => {
    expect(new Date(utcTime(50, 0)).getUTCFullYear()).toBe(50);
    expect(utcTime(2018, 0, 1, 12)).toBe(Date.UTC(2018, 0, 1, 12));
    expect(isoDateTime('0050-01-01')).toBe(utcTime(50, 0));
  });
});
