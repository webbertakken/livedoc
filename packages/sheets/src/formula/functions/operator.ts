// Google's Operator functions (docs/specs/029-sheets/formulas.md "Function catalogue", Operator): each operator by
// name, "Equivalent to the `+` operator" and so on in Google's help, so each is the operator itself, lifted over
// arrays as the operator is (CONCAT aside, below). ISBETWEEN is a pair of comparisons with its ends included unless told otherwise.
import type { BinaryOp } from '../ast';
import { MANY, fn, lift, scalarFn, valueArg, type FnDef } from '../fn';
import { binaryOperation, unaryOperation, type UnaryOperator } from '../operators';
import { compareScalars, isError, toBool } from '../values';
import { joinValues } from './text';

const binary = (op: BinaryOp): FnDef =>
  scalarFn(2, 2, ([a, b], f) => binaryOperation(op, a!, b!, f.locale));
const unary = (kind: UnaryOperator): FnDef =>
  scalarFn(1, 1, ([x], f) => unaryOperation(kind, x!, f.locale));

export const OPERATOR_FUNCTIONS: Record<string, FnDef> = {
  ADD: binary('+'),
  MINUS: binary('-'),
  MULTIPLY: binary('*'),
  DIVIDE: binary('/'),
  POW: binary('^'),
  // Google's CONCAT joins two values, each one value (a range met by the formula's row or column, as `&`);
  // OpenFormula's and Excel's any number, ranges whole. More than two, which Google refuses, are the standards' in
  // every meaning (D38); two are Google's, and the standards' in a file's meaning (formulas.md, the file's meaning).
  CONCAT: fn(1, MANY, (args, f) =>
    args.length === 2 && f.meaning === 'google'
      ? lift([valueArg(args[0]!, f), valueArg(args[1]!, f)], ([a, b]) =>
          binaryOperation('&', a!, b!, f.locale),
        )
      : joinValues(args, f),
  ),
  EQ: binary('='),
  NE: binary('<>'),
  GT: binary('>'),
  GTE: binary('>='),
  LT: binary('<'),
  LTE: binary('<='),
  UMINUS: unary('neg'),
  UPLUS: unary('pos'),
  UNARY_PERCENT: unary('pct'),
  // ISBETWEEN(value_to_compare, lower_value, upper_value, [lower_value_is_inclusive], [upper_value_is_inclusive]).
  ISBETWEEN: scalarFn(3, 5, ([value, lower, upper, lowerIn, upperIn]) => {
    for (const x of [value!, lower!, upper!]) if (isError(x)) return x;
    const withLower = lowerIn === undefined ? true : toBool(lowerIn);
    if (isError(withLower)) return withLower;
    const withUpper = upperIn === undefined ? true : toBool(upperIn);
    if (isError(withUpper)) return withUpper;
    const low = compareScalars(value!, lower!);
    const high = compareScalars(value!, upper!);
    return (withLower ? low >= 0 : low > 0) && (withUpper ? high <= 0 : high < 0);
  }),
};
