// How an XLSX file names a function (docs/specs/029-sheets/standard-mapping.md "Excel's grammar in detail"): Excel's
// later functions carry `_xlfn.` (FILTER and SORT `_xlfn._xlws.`), as XlsxWriter records them from MS-XLSX §2.2.2 and
// Excel's own files (https://xlsxwriter.readthedocs.io/working_with_formulas.html), with ENCODEURL, which Excel 2013
// added and writes the same way. Pure data; a name absent here is written as Google writes it.
import { GOOGLE_ONLY_FUNCTIONS } from './odf-function-names';

export const XLSX_FUTURE_PREFIX = '_xlfn.';
export const XLSX_WORKSHEET_PREFIX = '_xlfn._xlws.';
export const XLSX_PARAMETER_PREFIX = '_xlpm.';

export const XLSX_FUTURE_FUNCTIONS: ReadonlySet<string> = new Set([
  'ACOT',
  'ACOTH',
  'AGGREGATE',
  'ANCHORARRAY',
  'ARABIC',
  'ARRAYTOTEXT',
  'BASE',
  'BETA.DIST',
  'BETA.INV',
  'BINOM.DIST',
  'BINOM.DIST.RANGE',
  'BINOM.INV',
  'BITAND',
  'BITLSHIFT',
  'BITOR',
  'BITRSHIFT',
  'BITXOR',
  'BYCOL',
  'BYROW',
  'CEILING.MATH',
  'CEILING.PRECISE',
  'CHISQ.DIST',
  'CHISQ.DIST.RT',
  'CHISQ.INV',
  'CHISQ.INV.RT',
  'CHISQ.TEST',
  'CHOOSECOLS',
  'CHOOSEROWS',
  'COMBINA',
  'CONCAT',
  'CONFIDENCE.NORM',
  'CONFIDENCE.T',
  'COT',
  'COTH',
  'COVARIANCE.P',
  'COVARIANCE.S',
  'CSC',
  'CSCH',
  'DAYS',
  'DECIMAL',
  'DROP',
  'ENCODEURL',
  'ERF.PRECISE',
  'ERFC.PRECISE',
  'EXPAND',
  'EXPON.DIST',
  'F.DIST',
  'F.DIST.RT',
  'F.INV',
  'F.INV.RT',
  'F.TEST',
  'FILTERXML',
  'FLOOR.MATH',
  'FLOOR.PRECISE',
  'FORECAST.ETS',
  'FORECAST.ETS.CONFINT',
  'FORECAST.ETS.SEASONALITY',
  'FORECAST.ETS.STAT',
  'FORECAST.LINEAR',
  'FORMULATEXT',
  'GAMMA',
  'GAMMA.DIST',
  'GAMMA.INV',
  'GAMMALN.PRECISE',
  'GAUSS',
  'HSTACK',
  'HYPGEOM.DIST',
  'IFNA',
  'IFS',
  'IMCOSH',
  'IMCOT',
  'IMCSC',
  'IMCSCH',
  'IMSEC',
  'IMSECH',
  'IMSINH',
  'IMTAN',
  'ISFORMULA',
  'ISOMITTED',
  'ISOWEEKNUM',
  'LAMBDA',
  'LET',
  'LOGNORM.DIST',
  'LOGNORM.INV',
  'MAKEARRAY',
  'MAP',
  'MAXIFS',
  'MINIFS',
  'MODE.MULT',
  'MODE.SNGL',
  'MUNIT',
  'NEGBINOM.DIST',
  'NORM.DIST',
  'NORM.INV',
  'NORM.S.DIST',
  'NORM.S.INV',
  'NUMBERVALUE',
  'PDURATION',
  'PERCENTILE.EXC',
  'PERCENTILE.INC',
  'PERCENTRANK.EXC',
  'PERCENTRANK.INC',
  'PERMUTATIONA',
  'PHI',
  'POISSON.DIST',
  'QUARTILE.EXC',
  'QUARTILE.INC',
  'QUERYSTRING',
  'RANDARRAY',
  'RANK.AVG',
  'RANK.EQ',
  'REDUCE',
  'RRI',
  'SCAN',
  'SEC',
  'SECH',
  'SEQUENCE',
  'SHEET',
  'SHEETS',
  'SINGLE',
  'SKEW.P',
  'SORTBY',
  'STDEV.P',
  'STDEV.S',
  'SWITCH',
  'T.DIST',
  'T.DIST.2T',
  'T.DIST.RT',
  'T.INV',
  'T.INV.2T',
  'T.TEST',
  'TAKE',
  'TEXTAFTER',
  'TEXTBEFORE',
  'TEXTJOIN',
  'TEXTSPLIT',
  'TOCOL',
  'TOROW',
  'UNICHAR',
  'UNICODE',
  'UNIQUE',
  'VALUETOTEXT',
  'VAR.P',
  'VAR.S',
  'VSTACK',
  'WEBSERVICE',
  'WEIBULL.DIST',
  'WRAPCOLS',
  'WRAPROWS',
  'XLOOKUP',
  'XMATCH',
  'XOR',
  'Z.TEST',
]);

/** Excel's functions that only a worksheet may call, under `_xlfn._xlws.`. */
export const XLSX_WORKSHEET_FUNCTIONS: ReadonlySet<string> = new Set(['FILTER', 'SORT']);

/**
 * Functions LiveDoc works out that Excel has not (OpenFormula's own and a few of LibreOffice's): a formula calling one
 * is written by S5's convention, as one calling a Google-only function is (D83). Measured against MS-XLSX §2.2.2's
 * function lists.
 */
export const XLSX_MISSING_FUNCTIONS: ReadonlySet<string> = new Set([
  'CHISQDIST',
  'CHISQINV',
  'EASTERSUNDAY',
  'EUROCONVERT',
  'JIS',
  'MULTIPLE.OPERATIONS',
]);

/** Whether a formula calling this function (any case) has no Excel form and is wrapped by S5's convention. */
export function xlsxLacks(name: string): boolean {
  const upper = name.toUpperCase();
  return GOOGLE_ONLY_FUNCTIONS.has(upper) || XLSX_MISSING_FUNCTIONS.has(upper);
}

/** A function's name as an XLSX file writes it, from its name as typed (any case). */
export function xlsxFunctionName(name: string): string {
  const upper = name.toUpperCase();
  if (XLSX_WORKSHEET_FUNCTIONS.has(upper)) return `${XLSX_WORKSHEET_PREFIX}${upper}`;
  if (XLSX_FUTURE_FUNCTIONS.has(upper)) return `${XLSX_FUTURE_PREFIX}${upper}`;
  return name;
}

/** A function's name as Google writes it, from an XLSX file's: its prefixes gone. */
export function googleNameOfXlsx(name: string): string {
  const upper = name.toUpperCase();
  if (upper.startsWith(XLSX_WORKSHEET_PREFIX.toUpperCase()))
    return name.slice(XLSX_WORKSHEET_PREFIX.length);
  if (upper.startsWith(XLSX_FUTURE_PREFIX.toUpperCase()))
    return name.slice(XLSX_FUTURE_PREFIX.length);
  return name;
}
