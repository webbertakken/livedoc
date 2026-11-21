// Date and time functions (docs/specs/029-sheets/formulas.md "Functions": Date and time). Dates are serials
// (dates.ts); TODAY and NOW read the viewer's local time through the frame.
import {
  dateFromSerial,
  localeDayFirst,
  parseDateText,
  parseTimeText,
  serialFromDate,
} from '../../dates';
import {
  finite,
  fn,
  intArg,
  numArg,
  numFn,
  opt,
  scalarFn,
  textArg,
  volatileFn,
  type FnDef,
} from '../fn';
import { err, isError, toNumber, type Value } from '../values';
import { checkSerial, dateArg } from './date-args';
import { basisOf, daysInMonth, days360, yearFrac } from './day-count';
import { WORKDAY_FUNCTIONS } from './workdays';

// DATE(y, m, d): months and days past their range roll over (DATE(2026, 13, 1) is January 2027), and years before
// 1900 count from 1900, as spreadsheets do.
export function dateSerial(y: number, m: number, d: number): Value {
  let year = Math.trunc(y);
  if (year >= 0 && year < 1900) year += 1900;
  if (year < 0 || year > 9999) return err('#NUM!');
  const ms = Date.UTC(year, Math.trunc(m) - 1, 1) + (Math.trunc(d) - 1) * 86_400_000;
  const dt = new Date(ms);
  return checkSerial(serialFromDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
}

function addMonths(serial: number, months: number, endOfMonth: boolean): Value {
  const p = dateFromSerial(serial);
  const total = p.y * 12 + (p.m - 1) + Math.trunc(months);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  if (y < 1 || y > 9999) return err('#NUM!');
  const last = serialFromDate(y, m + 1, 1) - serialFromDate(y, m, 1);
  // Before 30 December 1899 is out of range, as for every other date function.
  return checkSerial(serialFromDate(y, m, endOfMonth ? last : Math.min(p.d, last)));
}

// A date function over numbers whose first argument may also be text that reads as a date or a time
// ("2026-03-01", "14:30"), as Excel and Google Sheets read it: YEAR("2026-03-01") is 2026. The rest are numbers.
function dateFn(min: number, max: number, each: (ns: number[]) => Value): FnDef {
  return scalarFn(min, max, (xs, f) => {
    const ns: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      if (i === 0 && typeof x === 'string') {
        const serial = parseDateText(x, localeDayFirst(f.locale))?.serial ?? parseTimeText(x);
        if (serial !== null) {
          ns.push(serial);
          continue;
        }
      }
      const n = toNumber(x, f.locale);
      if (typeof n !== 'number') return n;
      ns.push(n);
    }
    return finite(each(ns));
  });
}

// A date's year, month or day; a serial before 30 December 1899 is no date, #NUM!, as Google gives it (OpenFormula
// leaves negative serials to the application).
function datePart(serial: number, part: 'y' | 'm' | 'd'): Value {
  return serial < 0
    ? err('#NUM!', 'A date is never before 30 December 1899')
    : dateFromSerial(serial)[part];
}

// The week of the year whose weeks start on `startDay` (0 Sunday), the week holding 1 January being week 1.
function weekNumber(serial: number, startDay: number): number {
  const p = dateFromSerial(serial);
  const jan1 = serialFromDate(p.y, 1, 1);
  const jan1wd = dateFromSerial(jan1).weekday;
  const offset = (jan1wd - startDay + 7) % 7;
  return Math.floor((Math.floor(serial) - jan1 + offset) / 7) + 1;
}

// The day a week starts on for WEEKDAY's and WEEKNUM's types 11 to 17 (Excel's, and Google Sheets' WEEKNUM):
// 11 Monday through 16 Saturday, 17 Sunday. Null for any other type.
function weekStartOfType(type: number): number | null {
  return Number.isInteger(type) && type >= 11 && type <= 17 ? (type - 10) % 7 : null;
}

function isoWeek(serial: number): number {
  const s = Math.floor(serial);
  const wd = (dateFromSerial(s).weekday + 6) % 7; // Monday 0
  const thursday = s - wd + 3;
  const year = dateFromSerial(thursday).y;
  const firstThursdayWeek = serialFromDate(year, 1, 4);
  const fwd = (dateFromSerial(firstThursdayWeek).weekday + 6) % 7;
  return Math.floor((thursday - (firstThursdayWeek - fwd + 3)) / 7) + 1;
}

// EPOCHTODATE: 1 January 1970 as a serial, a day's milliseconds, and each unit's count in a millisecond.
const UNIX_EPOCH_SERIAL = 25_569;
const MS_PER_DAY = 86_400_000;
const EPOCH_UNITS_PER_MS: Record<number, number> = { 1: 0.001, 2: 1, 3: 1000 };

// Gregorian Easter (the anonymous Gregorian algorithm, as OpenFormula's EASTERSUNDAY): a two-digit year is 2000 to
// 2029 or 1930 to 1999, as two-digit dates read; years 1583 to 9956 only, as LibreOffice's.
const TWO_DIGIT_YEAR_PIVOT = 30;

function easterSunday(y: number): Value {
  let year = Math.trunc(y);
  if (year >= 0 && year < 100) year += year < TWO_DIGIT_YEAR_PIVOT ? 2000 : 1900;
  if (year < 1583 || year > 9956) return err('#NUM!', 'Easter is reckoned for 1583 to 9956');
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const h =
    (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const o = h + l - 7 * m + 114;
  return dateSerial(year, Math.floor(o / 31), (o % 31) + 1);
}

export const DATE_FUNCTIONS: Record<string, FnDef> = {
  EASTERSUNDAY: numFn(1, 1, ([y]) => easterSunday(y!)),
  TODAY: volatileFn(0, 0, (_a, f) => Math.floor(f.now())),
  NOW: volatileFn(0, 0, (_a, f) => f.now()),
  DATE: numFn(3, 3, ([y, m, d]) => dateSerial(y!, m!, d!)),
  TIME: numFn(3, 3, ([h, m, s]) => {
    const secs = Math.trunc(h!) * 3600 + Math.trunc(m!) * 60 + Math.trunc(s!);
    if (secs < 0) return err('#NUM!');
    // Whole seconds wrapped before dividing, so TIME(25, 0, 0) is exactly TIME(1, 0, 0).
    return (secs % 86_400) / 86_400;
  }),
  DATEVALUE: scalarFn(1, 1, ([t], f) => {
    if (typeof t === 'number') return Math.floor(t);
    if (typeof t !== 'string') return err('#VALUE!');
    const d = parseDateText(t, localeDayFirst(f.locale));
    return d ? Math.floor(d.serial) : err('#VALUE!', `"${t}" is not a date`);
  }),
  TIMEVALUE: scalarFn(1, 1, ([t], f) => {
    if (typeof t !== 'string') return err('#VALUE!');
    const time = parseTimeText(t);
    if (time !== null) return time;
    const d = parseDateText(t, localeDayFirst(f.locale));
    return d ? d.serial - Math.floor(d.serial) : err('#VALUE!', `"${t}" is not a time`);
  }),
  YEAR: dateFn(1, 1, ([s]) => datePart(s!, 'y')),
  MONTH: dateFn(1, 1, ([s]) => datePart(s!, 'm')),
  DAY: dateFn(1, 1, ([s]) => datePart(s!, 'd')),
  HOUR: dateFn(1, 1, ([s]) => dateFromSerial(s!).h),
  MINUTE: dateFn(1, 1, ([s]) => dateFromSerial(s!).min),
  SECOND: dateFn(1, 1, ([s]) => dateFromSerial(s!).s),
  WEEKDAY: dateFn(1, 2, ([s, type = 1]) => {
    const wd = dateFromSerial(s!).weekday;
    if (type === 1) return wd + 1;
    if (type === 2) return ((wd + 6) % 7) + 1;
    if (type === 3) return (wd + 6) % 7;
    const start = weekStartOfType(type);
    return start === null ? err('#NUM!') : ((wd - start + 7) % 7) + 1;
  }),
  WEEKNUM: dateFn(1, 2, ([s, type = 1]) => {
    if (type === 1 || type === 2) return weekNumber(s!, type === 2 ? 1 : 0);
    if (type === 21) return isoWeek(s!);
    const start = weekStartOfType(type);
    return start === null ? err('#NUM!') : weekNumber(s!, start);
  }),
  ISOWEEKNUM: dateFn(1, 1, ([s]) => isoWeek(s!)),
  EDATE: dateFn(2, 2, ([s, m]) => addMonths(s!, m!, false)),
  EOMONTH: dateFn(2, 2, ([s, m]) => addMonths(s!, m!, true)),
  DATEDIF: fn(3, 3, (args, f) => {
    const a = dateArg(args[0]!, f);
    const b = dateArg(args[1]!, f);
    if (typeof a !== 'number') return a;
    if (typeof b !== 'number') return b;
    const unit = textArg(args[2]!, f);
    if (isError(unit)) return unit;
    if (b < a) return err('#NUM!', 'The start date is after the end date');
    const pa = dateFromSerial(a);
    const pb = dateFromSerial(b);
    let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
    if (pb.d < pa.d) months -= 1;
    switch (unit.toUpperCase()) {
      case 'Y':
        return Math.floor(months / 12);
      case 'M':
        return months;
      case 'D':
        return Math.floor(b) - Math.floor(a);
      case 'MD': {
        // The end's day less the start's, as Google and Excel count it: below zero, plus the length of the month
        // before the end's (31 January to 1 March is 1 - 31 + 28, -2).
        const gap = pb.d - pa.d;
        return gap >= 0
          ? gap
          : gap + daysInMonth(pb.m === 1 ? pb.y - 1 : pb.y, pb.m === 1 ? 12 : pb.m - 1);
      }
      case 'YM':
        return months % 12;
      case 'YD': {
        let start = serialFromDate(pb.y, pa.m, pa.d);
        if (start > b) start = serialFromDate(pb.y - 1, pa.m, pa.d);
        return Math.floor(b) - start;
      }
      default:
        return err('#NUM!', `"${unit}" is not a DATEDIF unit`);
    }
  }),
  DAYS: fn(2, 2, (args, f) => {
    const e = dateArg(args[0]!, f);
    const s = dateArg(args[1]!, f);
    if (typeof e !== 'number') return e;
    if (typeof s !== 'number') return s;
    return Math.floor(e) - Math.floor(s);
  }),
  // A Unix time in UTC (Google's): seconds, milliseconds or microseconds, fractions of a millisecond dropped.
  EPOCHTODATE: fn(1, 2, (args, f) => {
    const t = numArg(args[0]!, f);
    const unit = opt(args, 1, f, intArg, 1);
    if (isError(t)) return t;
    if (isError(unit)) return unit;
    const perMs = EPOCH_UNITS_PER_MS[unit];
    if (perMs === undefined)
      return err('#NUM!', 'The unit is 1 (seconds), 2 (milliseconds) or 3 (microseconds)');
    if (t < 0) return err('#NUM!', 'A timestamp is never negative');
    return checkSerial(UNIX_EPOCH_SERIAL + Math.trunc(t / perMs) / MS_PER_DAY);
  }),
  YEARFRAC: fn(2, 3, (args, f) => {
    const a = dateArg(args[0]!, f);
    const b = dateArg(args[1]!, f);
    if (typeof a !== 'number') return a;
    if (typeof b !== 'number') return b;
    const convention = opt(args, 2, f, numArg, 0);
    if (isError(convention)) return convention;
    const basis = basisOf(convention);
    if (isError(basis)) return basis;
    return yearFrac(Math.floor(a), Math.floor(b), basis, f.meaning);
  }),
  DAYS360: fn(2, 3, (args, f) => {
    const a = dateArg(args[0]!, f);
    const b = dateArg(args[1]!, f);
    if (typeof a !== 'number') return a;
    if (typeof b !== 'number') return b;
    const method = opt(args, 2, f, numArg, 0);
    if (isError(method)) return method;
    return days360(Math.floor(a), Math.floor(b), method !== 0);
  }),
  ...WORKDAY_FUNCTIONS,
};
