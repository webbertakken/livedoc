// Working days (docs/specs/029-sheets/formulas.md "Functions": Date and time): NETWORKDAYS and WORKDAY with Saturday
// and Sunday off, and their .INTL forms with any weekend: a number (1 Saturday and Sunday ... 7 Friday and Saturday,
// 11 Sunday ... 17 Saturday alone) or seven 0s and 1s from Monday, 1 a day off. Holidays are taken off too.
import { dateFromSerial } from '../../dates';
import type { EvalValue, Frame } from '../../engine/frame';
import { arrayArg, flatValues, fn, numArg, scalarArg, type FnDef } from '../fn';
import { err, isError, toNumber, type Value } from '../values';
import { checkSerial, dateArg } from './date-args';

// The longest span NETWORKDAYS walks and the most days WORKDAY moves: past every date a sheet holds.
const NETWORKDAYS_SPAN_MAX = 400_000;
const WORKDAY_DAYS_MAX = 300_000;

/** Which days are off, by weekday (0 Sunday ... 6 Saturday). */
type Weekend = readonly boolean[];

const SATURDAY_SUNDAY: Weekend = [true, false, false, false, false, false, true];

// A weekend number's two days off (1 to 7, the first of them from Saturday on) or one day (11 to 17, from Sunday).
function weekendOfNumber(n: number): Weekend | null {
  const off = Array<boolean>(7).fill(false);
  if (Number.isInteger(n) && n >= 1 && n <= 7) {
    off[(n + 5) % 7] = true;
    off[(n + 6) % 7] = true;
    return off;
  }
  if (Number.isInteger(n) && n >= 11 && n <= 17) {
    off[n - 11] = true;
    return off;
  }
  return null;
}

// The .INTL weekend argument, Saturday and Sunday when left out. Seven 1s (no working day) is refused.
function weekendArg(args: EvalValue[], i: number, f: Frame): Weekend | Value {
  const a = args[i];
  if (a === undefined || a === null) return SATURDAY_SUNDAY;
  const x = scalarArg(a, f);
  if (isError(x)) return x;
  if (typeof x === 'string') {
    if (!/^[01]{7}$/.test(x) || x === '1111111')
      return err('#NUM!', 'A weekend is seven 0s and 1s from Monday, with a working day');
    // Monday first in the text; Sunday first by weekday.
    return [x[6] === '1', ...[...x.slice(0, 6)].map((c) => c === '1')];
  }
  const n = toNumber(x, f.locale);
  if (isError(n)) return n;
  return weekendOfNumber(n) ?? err('#NUM!', `${n} is not a weekend`);
}

function holidaysOf(args: EvalValue[], i: number, f: Frame): Set<number> | Value {
  const out = new Set<number>();
  const a = args[i];
  if (a === undefined || a === null) return out;
  for (const x of flatValues(arrayArg(a, f))) {
    if (isError(x)) return x;
    if (typeof x === 'number') out.add(Math.floor(x));
  }
  return out;
}

const isWorkday = (serial: number, weekend: Weekend, holidays: Set<number>) =>
  !weekend[dateFromSerial(serial).weekday] && !holidays.has(serial);

// The working days from start to end, both counted; negative when end comes first.
function networkdays(args: EvalValue[], f: Frame, weekendAt: number | null): Value {
  const a = dateArg(args[0]!, f);
  const b = dateArg(args[1]!, f);
  if (typeof a !== 'number') return a;
  if (typeof b !== 'number') return b;
  const weekend = weekendAt === null ? SATURDAY_SUNDAY : weekendArg(args, weekendAt, f);
  if (!Array.isArray(weekend)) return weekend as Value;
  const hol = holidaysOf(args, weekendAt === null ? 2 : 3, f);
  if (!(hol instanceof Set)) return hol;
  const [s, e, sign] =
    a <= b ? [Math.floor(a), Math.floor(b), 1] : [Math.floor(b), Math.floor(a), -1];
  if (e - s > NETWORKDAYS_SPAN_MAX) return err('#NUM!', 'The span is too long to count');
  let n = 0;
  for (let d = s; d <= e; d++) if (isWorkday(d, weekend, hol)) n++;
  return n * sign;
}

// The date `days` working days on from start (back when negative), start itself not counted.
function workday(args: EvalValue[], f: Frame, weekendAt: number | null): Value {
  const a = dateArg(args[0]!, f);
  const days = numArg(args[1]!, f);
  if (typeof a !== 'number') return a;
  if (isError(days)) return days;
  const weekend = weekendAt === null ? SATURDAY_SUNDAY : weekendArg(args, weekendAt, f);
  if (!Array.isArray(weekend)) return weekend as Value;
  const hol = holidaysOf(args, weekendAt === null ? 2 : 3, f);
  if (!(hol instanceof Set)) return hol;
  let d = Math.floor(a);
  let left = Math.trunc(days);
  const step = left < 0 ? -1 : 1;
  if (Math.abs(left) > WORKDAY_DAYS_MAX) return err('#NUM!', 'Too many days to move');
  while (left !== 0) {
    d += step;
    if (isWorkday(d, weekend, hol)) left -= step;
  }
  return checkSerial(d);
}

export const WORKDAY_FUNCTIONS: Record<string, FnDef> = {
  NETWORKDAYS: fn(2, 3, (args, f) => networkdays(args, f, null)),
  'NETWORKDAYS.INTL': fn(2, 4, (args, f) => networkdays(args, f, 2)),
  WORKDAY: fn(2, 3, (args, f) => workday(args, f, null)),
  'WORKDAY.INTL': fn(2, 4, (args, f) => workday(args, f, 2)),
};
