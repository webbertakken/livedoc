// Finance functions (docs/specs/029-sheets/formulas.md "Functions": Finance), with Sheets' sign conventions:
// money paid out is negative. This file holds the annuities and rates and gathers the family; cash flows, depreciation,
// coupons and securities live beside it.
import { numFn, type FnDef } from '../fn';
import { err } from '../values';
import { CASH_FLOW_FUNCTIONS } from './cash-flows';
import { COUPON_FUNCTIONS } from './coupons';
import { DEPRECIATION_FUNCTIONS } from './depreciation';
import { DISCOUNT_SECURITY_FUNCTIONS } from './discount-securities';
import { ODD_COUPON_FUNCTIONS } from './odd-coupons';
import { SECURITY_FUNCTIONS } from './securities';
import { solve } from './solve';

function pmt(rate: number, nper: number, pv: number, fv: number, type: number): number {
  if (rate === 0) return -(pv + fv) / nper;
  const pow = (1 + rate) ** nper;
  return (-rate * (pv * pow + fv)) / ((1 + rate * type) * (pow - 1));
}

function fv(rate: number, nper: number, payment: number, pv: number, type: number): number {
  if (rate === 0) return -(pv + payment * nper);
  const pow = (1 + rate) ** nper;
  return -(pv * pow + (payment * (1 + rate * type) * (pow - 1)) / rate);
}

// The interest part of payment `per` (1 to nper): none in the first period when payments come at the beginning.
function ipmt(
  rate: number,
  per: number,
  nper: number,
  pv: number,
  f: number,
  type: number,
): number {
  const payment = pmt(rate, nper, pv, f, type);
  if (per === 1) return type ? 0 : -pv * rate;
  if (type) return (fv(rate, per - 2, payment, pv, 1) - payment) * rate;
  return fv(rate, per - 1, payment, pv, 0) * rate;
}

// CUMIPMT and CUMPRINC: the periods from first to last (a fraction moves each inward: 2.1 to 3, 4.9 to 4), summed.
function cumulative(part: 'interest' | 'principal') {
  return numFn(6, 6, ([rate, nper, pv, first, last, type]) => {
    const from = Math.ceil(first!);
    const to = Math.floor(last!);
    if (rate! <= 0 || nper! <= 0 || pv! <= 0)
      return err('#NUM!', 'The rate, periods and value are positive');
    if (from < 1 || to < from || to > nper!)
      return err('#NUM!', 'The periods run from 1 to the number of periods');
    if (type !== 0 && type !== 1)
      return err('#NUM!', 'Payments are at the end (0) or beginning (1)');
    const payment = pmt(rate!, nper!, pv!, 0, type);
    let sum = 0;
    for (let per = from; per <= to; per++) {
      const interest = ipmt(rate!, per, nper!, pv!, 0, type);
      sum += part === 'interest' ? interest : payment - interest;
    }
    return sum;
  });
}

// The integer and fraction parts of a price, as written (100.01) and as meant (100 1/8): DOLLARDE and DOLLARFR. The
// written fraction has at least two decimal places, as Google's help reads 100.01 in eighths; in wholes (unit 1) it
// is the decimal itself (D51).
const FRACTION_DIGITS_MIN = 2;

function fractionalPrice(toDecimal: boolean) {
  return numFn(2, 2, ([price, unit]) => {
    const u = Math.trunc(unit!);
    if (u < 0) return err('#NUM!', 'The unit is positive');
    if (u === 0) return err('#DIV/0!', 'The unit is at least 1');
    const whole = Math.trunc(price!);
    const scale = u === 1 ? 1 : 10 ** Math.max(FRACTION_DIGITS_MIN, Math.ceil(Math.log10(u)));
    return whole + (toDecimal ? ((price! - whole) * scale) / u : ((price! - whole) * u) / scale);
  });
}

const ANNUITY_FUNCTIONS: Record<string, FnDef> = {
  PMT: numFn(3, 5, ([rate, nper, pv, f = 0, type = 0]) =>
    nper === 0 ? err('#NUM!') : pmt(rate!, nper!, pv!, f, type ? 1 : 0),
  ),
  FV: numFn(3, 5, ([rate, nper, payment, pv = 0, type = 0]) =>
    fv(rate!, nper!, payment!, pv, type ? 1 : 0),
  ),
  PV: numFn(3, 5, ([rate, nper, payment, f = 0, type = 0]) => {
    const t = type ? 1 : 0;
    if (rate === 0) return -(f + payment! * nper!);
    const pow = (1 + rate!) ** nper!;
    return -(f + (payment! * (1 + rate! * t) * (pow - 1)) / rate!) / pow;
  }),
  NPER: numFn(3, 5, ([rate, payment, pv, f = 0, type = 0]) => {
    const t = type ? 1 : 0;
    if (rate === 0) return payment === 0 ? err('#NUM!') : -(pv! + f) / payment!;
    const a = payment! * (1 + rate! * t) - f * rate!;
    const b = pv! * rate! + payment! * (1 + rate! * t);
    if (a / b <= 0) return err('#NUM!');
    return Math.log(a / b) / Math.log(1 + rate!);
  }),
  RATE: numFn(3, 6, ([nper, payment, pv, f = 0, type = 0, guess = 0.1]) => {
    const t = type ? 1 : 0;
    const r = solve(
      (x) => (x === 0 ? pv! + payment! * nper! + f : f - fv(x, nper!, payment!, pv!, t)),
      guess,
    );
    return r === null ? err('#NUM!', 'RATE did not settle; try another guess') : r;
  }),
  IPMT: numFn(4, 6, ([rate, per, nper, pv, f = 0, type = 0]) =>
    per! < 1 || per! > nper!
      ? err('#NUM!', 'The period is from 1 to the number of periods')
      : ipmt(rate!, per!, nper!, pv!, f, type ? 1 : 0),
  ),
  PPMT: numFn(4, 6, ([rate, per, nper, pv, f = 0, type = 0]) => {
    if (per! < 1 || per! > nper!)
      return err('#NUM!', 'The period is from 1 to the number of periods');
    const t = type ? 1 : 0;
    return pmt(rate!, nper!, pv!, f, t) - ipmt(rate!, per!, nper!, pv!, f, t);
  }),
  CUMIPMT: cumulative('interest'),
  CUMPRINC: cumulative('principal'),
  ISPMT: numFn(4, 4, ([rate, per, nper, pv]) =>
    nper === 0 ? err('#NUM!', 'The number of periods is not 0') : pv! * rate! * (per! / nper! - 1),
  ),
  PDURATION: numFn(3, 3, ([rate, pv, f]) =>
    rate! <= 0 || pv! <= 0 || f! <= 0
      ? err('#NUM!', 'The rate and both values are positive')
      : Math.log(f! / pv!) / Math.log1p(rate!),
  ),
  RRI: numFn(3, 3, ([nper, pv, f]) =>
    nper! <= 0 || pv === 0
      ? err('#NUM!', 'The periods are positive and the present value is not 0')
      : (f! / pv!) ** (1 / nper!) - 1,
  ),
  EFFECT: numFn(2, 2, ([nominal, periods]) => {
    const n = Math.trunc(periods!);
    if (nominal! < 0 || n < 1)
      return err('#NUM!', 'The rate is not negative and the periods at least 1');
    return (1 + nominal! / n) ** n - 1;
  }),
  NOMINAL: numFn(2, 2, ([effective, periods]) => {
    const n = Math.trunc(periods!);
    if (effective! <= 0 || n < 1)
      return err('#NUM!', 'The rate is positive and the periods at least 1');
    return ((1 + effective!) ** (1 / n) - 1) * n;
  }),
  DOLLARDE: fractionalPrice(true),
  DOLLARFR: fractionalPrice(false),
};

export const FINANCE_FUNCTIONS: Record<string, FnDef> = {
  ...ANNUITY_FUNCTIONS,
  ...CASH_FLOW_FUNCTIONS,
  ...DEPRECIATION_FUNCTIONS,
  ...COUPON_FUNCTIONS,
  ...SECURITY_FUNCTIONS,
  ...DISCOUNT_SECURITY_FUNCTIONS,
  ...ODD_COUPON_FUNCTIONS,
};
