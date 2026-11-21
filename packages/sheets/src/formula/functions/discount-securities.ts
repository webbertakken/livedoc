// Discount securities (docs/specs/029-sheets/formulas.md "Functions": Finance): ones bought below their
// redemption and paying no coupon, treasury bills among them. Rates are annual; prices per 100 of face value.
import { dateFromSerial, serialFromDate } from '../../dates';
import type { FnDef } from '../fn';
import { err, isError, type SheetError } from '../values';
import type { FormulaMeaning } from '../meaning';
import { basisOf, securityYears } from './day-count';
import { financeFn } from './finance-args';

// A span from settlement to maturity as a fraction of a year, by the convention, once both are checked.
type Years = (a: number, b: number, basis: number, meaning: FormulaMeaning) => number;

function span(
  settlement: number,
  maturity: number,
  b: number,
  years: Years,
  meaning: FormulaMeaning,
): number | SheetError {
  const basis = basisOf(b);
  if (isError(basis)) return basis;
  if (settlement >= maturity) return err('#NUM!', 'Settlement is before maturity');
  return years(settlement, maturity, basis, meaning);
}

// A function of settlement, maturity, two positive amounts and a day count convention.
function discountFn(years: Years, each: (a: number, b: number, t: number) => number): FnDef {
  return financeFn(4, 5, [0, 1], ([settlement, maturity, a, b, basis = 0], f) => {
    if (a! <= 0 || b! <= 0) return err('#NUM!', 'Both amounts are positive');
    const t = span(settlement!, maturity!, basis, years, f.meaning);
    return isError(t) ? t : each(a!, b!, t);
  });
}

// A treasury bill's days from settlement to maturity: after settlement and within a year of it (Actual/360).
function billDays(settlement: number, maturity: number): number | SheetError {
  if (settlement >= maturity) return err('#NUM!', 'Settlement is before maturity');
  const s = dateFromSerial(settlement);
  if (maturity > serialFromDate(s.y + 1, s.m, s.d))
    return err('#NUM!', 'Maturity is within a year of settlement');
  return maturity - settlement;
}

function billFn(each: (amount: number, days: number) => number): FnDef {
  return financeFn(3, 3, [0, 1], ([settlement, maturity, amount]) => {
    if (amount! <= 0) return err('#NUM!', 'The discount or price is positive');
    const days = billDays(settlement!, maturity!);
    return isError(days) ? days : each(amount!, days);
  });
}

export const DISCOUNT_SECURITY_FUNCTIONS: Record<string, FnDef> = {
  DISC: discountFn(securityYears, (pr, redemption, t) => (1 - pr / redemption) / t),
  PRICEDISC: discountFn(
    securityYears,
    (discount, redemption, t) => redemption * (1 - discount * t),
  ),
  YIELDDISC: discountFn(securityYears, (pr, redemption, t) => (redemption / pr - 1) / t),
  INTRATE: discountFn(
    securityYears,
    (investment, redemption, t) => (redemption / investment - 1) / t,
  ),
  RECEIVED: discountFn(securityYears, (investment, discount, t) => investment / (1 - discount * t)),
  TBILLPRICE: billFn((discount, days) => 100 * (1 - (discount * days) / 360)),
  TBILLYIELD: billFn((pr, days) => ((100 - pr) / pr) * (360 / days)),
  TBILLEQ: billFn((discount, days) => (365 * discount) / (360 - discount * days)),
};
