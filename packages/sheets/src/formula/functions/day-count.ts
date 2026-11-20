// Day counts (docs/specs/029-sheets/formulas.md "Functions": Date and time, Finance): the five day count
// conventions a security function takes, 0 US (NASD) 30/360, 1 Actual/Actual, 2 Actual/360, 3 Actual/365 and
// 4 European 30/360, and DAYS360's two methods. Dates are whole serials.
import { dateFromSerial, serialFromDate } from '../../dates';
import { err, type SheetError } from '../values';

type Day = { y: number; m: number; d: number };

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) => serialFromDate(y, m + 1, 1) - serialFromDate(y, m, 1);
export const isLastOfMonth = (p: Day) => p.d === daysInMonth(p.y, p.m);
const isLastOfFebruary = (p: Day) => p.m === 2 && isLastOfMonth(p);

/** A day count convention argument: 0 to 4, its fraction dropped; any other is `#NUM!`. */
export function basisOf(n: number): number | SheetError {
  const basis = Math.trunc(n);
  return basis >= 0 && basis <= 4 ? basis : err('#NUM!', 'The day count convention is 0, 1, 2, 3 or 4');
}

/** A coupon frequency argument: 1, 2 or 4 a year, its fraction dropped; any other is `#NUM!`. */
export function frequencyOf(n: number): number | SheetError {
  const frequency = Math.trunc(n);
  return frequency === 1 || frequency === 2 || frequency === 4
    ? frequency
    : err('#NUM!', 'The frequency is 1, 2 or 4 payments a year');
}

// YEARFRAC's year fraction, as Excel and Google Sheets count it. Basis 0 is US 30/360 with its February rule (the
// last day of February counts as the 30th); basis 1 divides by 366 when a span of a year or less takes in a
// 29 February, else by 365, and a longer span by the average length of the years it touches. Basis 4 is European.
export function yearFrac(a: number, b: number, basis: number): number {
  const [s, e] = a <= b ? [a, b] : [b, a];
  const ps = dateFromSerial(s);
  const pe = dateFromSerial(e);
  switch (basis) {
    case 0: {
      let d1 = ps.d;
      let d2 = pe.d;
      if (d1 === 31 && d2 === 31) [d1, d2] = [30, 30];
      else if (d1 === 31) d1 = 30;
      else if (d1 === 30 && d2 === 31) d2 = 30;
      else if (isLastOfFebruary(ps) && isLastOfFebruary(pe)) [d1, d2] = [30, 30];
      else if (isLastOfFebruary(ps)) d1 = 30;
      return ((pe.y - ps.y) * 360 + (pe.m - ps.m) * 30 + (d2 - d1)) / 360;
    }
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

// The span in years as the accrued-interest functions count it (ACCRINT, ACCRINTM, INTRATE, RECEIVED, PRICEDISC):
// the days by the convention over the length of the first year. 30/360 takes the days' difference as it is, US less
// one or two days for a span from February into a later month of the same year. `s` is before `e`.
export function accrualYears(s: number, e: number, basis: number): number {
  const ps = dateFromSerial(s);
  switch (basis) {
    case 0:
    case 4: {
      const pe = dateFromSerial(e);
      let days = ((pe.y - ps.y) * 12 + pe.m - ps.m) * 30 + pe.d - ps.d;
      if (basis === 0 && ps.m === 2 && pe.m !== 2 && ps.y === pe.y) days -= isLeapYear(ps.y) ? 1 : 2;
      return days / 360;
    }
    case 1:
      return (e - s) / (isLeapYear(ps.y) ? 366 : 365);
    case 2:
      return (e - s) / 360;
    default:
      return (e - s) / 365;
  }
}

// The days between two dates of a coupon schedule, by the convention. 30/360 reads a month's last day as the 30th;
// US keeps an end on the 31st after a start before the 30th, and counts an end on February's last day as it is;
// European counts February's last day as it is at either end.
export function couponDayDiff(a: number, b: number, basis: number): number {
  if (basis !== 0 && basis !== 4) return b - a;
  const pa = dateFromSerial(a);
  const pb = dateFromSerial(b);
  let d1 = isLastOfMonth(pa) ? 30 : Math.min(pa.d, 30);
  let d2 = isLastOfMonth(pb) ? 30 : Math.min(pb.d, 30);
  if (basis === 0) {
    if ((pa.m === 2 || d1 < 30) && pb.d === 31) d2 = 31;
    else if (isLastOfFebruary(pb)) d2 = pb.d;
  } else {
    if (pa.m === 2 && d1 === 30) d1 = pa.d;
    if (pb.m === 2 && d2 === 30) d2 = pb.d;
  }
  return Math.max(0, (pb.y - pa.y) * 360 + (pb.m - pa.m) * 30 + d2 - d1);
}
