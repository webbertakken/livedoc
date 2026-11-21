// Day counts (docs/specs/029-sheets/formulas.md "Functions": Date and time, Finance): the five day count
// conventions a security function takes, 0 US (NASD) 30/360, 1 Actual/Actual, 2 Actual/360, 3 Actual/365 and
// 4 European 30/360, and DAYS360's two methods. Dates are whole serials.
import { dateFromSerial, serialFromDate } from '../../dates';
import type { FormulaMeaning } from '../meaning';
import { err, type SheetError } from '../values';

type Day = { y: number; m: number; d: number };

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) =>
  serialFromDate(y, m + 1, 1) - serialFromDate(y, m, 1);
export const isLastOfMonth = (p: Day) => p.d === daysInMonth(p.y, p.m);
const isLastOfFebruary = (p: Day) => p.m === 2 && isLastOfMonth(p);

/** A day count convention argument: 0 to 4, its fraction dropped; any other is `#NUM!`. */
export function basisOf(n: number): number | SheetError {
  const basis = Math.trunc(n);
  return basis >= 0 && basis <= 4
    ? basis
    : err('#NUM!', 'The day count convention is 0, 1, 2, 3 or 4');
}

/** A coupon frequency argument: 1, 2 or 4 a year, its fraction dropped; any other is `#NUM!`. */
export function frequencyOf(n: number): number | SheetError {
  const frequency = Math.trunc(n);
  return frequency === 1 || frequency === 2 || frequency === 4
    ? frequency
    : err('#NUM!', 'The frequency is 1, 2 or 4 payments a year');
}

// Google's Actual/Actual past a year: the whole years from the start, and the days left over the length of the year
// they fall in (1 January 2024 to 30 June 2025 is 1 + 180/365).
function wholeYearsAndRest(s: number, e: number): number {
  const p = dateFromSerial(s);
  let years = 0;
  while (serialFromDate(p.y + years + 1, p.m, p.d) <= e) years++;
  const from = serialFromDate(p.y + years, p.m, p.d);
  return years + (e - from) / (serialFromDate(p.y + years + 1, p.m, p.d) - from);
}

// YEARFRAC's year fraction, as Excel and Google Sheets count it. Basis 0 is US 30/360 with its February rule (the
// last day of February counts as the 30th); basis 1 divides by 366 when a span of a year or less takes in a
// 29 February, else by 365. A longer span is Google's whole years and the rest; in OpenFormula's meaning, the days
// over the average length of the years it touches (Part 4 §4.11.7.7, procedure E; the file's meaning). Basis 4 is
// European.
export function yearFrac(
  a: number,
  b: number,
  basis: number,
  meaning: FormulaMeaning = 'google',
): number {
  const [s, e] = a <= b ? [a, b] : [b, a];
  const ps = dateFromSerial(s);
  const pe = dateFromSerial(e);
  switch (basis) {
    case 0:
      return usDays360(s, e) / 360;
    case 1: {
      const days = e - s;
      const withinAYear =
        ps.y === pe.y || (pe.y === ps.y + 1 && (ps.m > pe.m || (ps.m === pe.m && ps.d >= pe.d)));
      if (withinAYear) {
        let leap = ps.y === pe.y && isLeapYear(ps.y);
        for (let y = ps.y; !leap && y <= pe.y; y++) {
          if (!isLeapYear(y)) continue;
          const feb29 = serialFromDate(y, 2, 29);
          leap = s <= feb29 && feb29 <= e;
        }
        return days / (leap ? 366 : 365);
      }
      if (meaning !== 'openformula') return wholeYearsAndRest(s, e);
      let total = 0;
      for (let y = ps.y; y <= pe.y; y++)
        total += serialFromDate(y + 1, 1, 1) - serialFromDate(y, 1, 1);
      return days / (total / (pe.y - ps.y + 1));
    }
    case 2:
      return (e - s) / 360;
    case 3:
      return (e - s) / 365;
    default: {
      const d1 = Math.min(ps.d, 30);
      const d2 = Math.min(pe.d, 30);
      return ((pe.y - ps.y) * 360 + (pe.m - ps.m) * 30 + (d2 - d1)) / 360;
    }
  }
}

/** OpenFormula's US (NASD) 30/360 days from `s` to a later `e` (Part 4 §4.11.7.3, procedure A). */
export function usDays360(s: number, e: number): number {
  const ps = dateFromSerial(s);
  const pe = dateFromSerial(e);
  let d1 = ps.d;
  let d2 = pe.d;
  if (d1 === 31 && d2 === 31) [d1, d2] = [30, 30];
  else if (d1 === 31) d1 = 30;
  else if (d1 === 30 && d2 === 31) d2 = 30;
  else if (isLastOfFebruary(ps) && isLastOfFebruary(pe)) [d1, d2] = [30, 30];
  else if (isLastOfFebruary(ps)) d1 = 30;
  return (pe.y - ps.y) * 360 + (pe.m - ps.m) * 30 + (d2 - d1);
}

// DAYS360 as Google's help words it. US: a start on a month's last day counts as the 30th; an end on the 31st counts
// as the 30th after a start on the 30th, else as the 1st of the next month. European: any 31st counts as the 30th.
export function days360(a: number, b: number, european: boolean): number {
  const ps = dateFromSerial(a);
  const pe = dateFromSerial(b);
  let d1 = ps.d;
  let d2 = pe.d;
  if (d1 === 31 || (!european && isLastOfFebruary(ps))) d1 = 30;
  if (d2 === 31 && (european || d1 === 30)) d2 = 30;
  return (pe.y - ps.y) * 360 + (pe.m - ps.m) * 30 + (d2 - d1);
}

// Actual/Actual split by calendar year (ISDA): each year's days over that year's length.
function actualByYear(s: number, e: number): number {
  let years = 0;
  for (let y = dateFromSerial(s).y, from = s; from < e; y++) {
    const next = serialFromDate(y + 1, 1, 1);
    const to = Math.min(e, next);
    years += (to - from) / (isLeapYear(y) ? 366 : 365);
    from = to;
  }
  return years;
}

// The span in years as Google's securities count it (ACCRINT, ACCRINTM, INTRATE, RECEIVED, PRICEDISC, PRICEMAT,
// YIELDMAT; measured): basis 0 is DAYS360's US method, also counting an end on February's last day as the 30th after
// a start on one; basis 1 splits the span by calendar year (a span from 2007 into 2008 is its 2007 days over 365 and
// its 2008 days over 366); basis 4 is DAYS360's European method. In OpenFormula's meaning, YEARFRAC's procedures
// (Part 4 §4.11.7; the file's meaning). `s` is before `e`.
export function securityYears(
  s: number,
  e: number,
  basis: number,
  meaning: FormulaMeaning = 'google',
): number {
  if (meaning === 'openformula') return yearFrac(s, e, basis, meaning);
  switch (basis) {
    case 0: {
      const febEnds = isLastOfFebruary(dateFromSerial(s)) && isLastOfFebruary(dateFromSerial(e));
      return (days360(s, e, false) + (febEnds ? 30 - dateFromSerial(e).d : 0)) / 360;
    }
    case 1:
      return actualByYear(s, e);
    case 2:
      return (e - s) / 360;
    case 3:
      return (e - s) / 365;
    default:
      return days360(s, e, true) / 360;
  }
}

/** The days from a coupon date to a later date as Google's COUPDAYBS counts them: DAYS360's methods, else actual. */
export function couponDayDiff(a: number, b: number, basis: number): number {
  if (basis !== 0 && basis !== 4) return b - a;
  return days360(a, b, basis === 4);
}
