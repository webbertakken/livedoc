// QUERY (docs/specs/029-sheets/formulas.md "QUERY"): Google's Visualization API Query Language over a range or an
// array, its table spilled with its labels on top.
import { isRef } from '../../engine/frame';
import { arrayArg, fn, intArg, opt, textArg, type FnDef } from '../fn';
import { parseQuery, type QueryFailure } from '../query/query-parse';
import { runQuery } from '../query/query-run';
import { queryTable } from '../query/query-table';
import { err, isError, type Value } from '../values';

const unparsed = (why: string) =>
  err('#VALUE!', `Unable to parse query string for Function QUERY parameter 2: ${why}`);

export const QUERY_FUNCTIONS: Record<string, FnDef> = {
  QUERY: fn(2, 3, (args, f) => {
    const firstCol = isRef(args[0]!) ? args[0].ref.c1 : null;
    const data = arrayArg(args[0]!, f);
    const text = textArg(args[1]!, f);
    if (isError(text)) return text;
    const headers = opt(args, 2, f, intArg, -1);
    if (isError(headers)) return headers;
    const table = queryTable(data.rows, headers, firstCol);
    if ('e' in table) return table.e;
    let result;
    try {
      result = runQuery(parseQuery(text), table, f.now());
    } catch (e) {
      // Reading and checking a query throw only QueryFailure, whose message is Google's reason.
      return unparsed((e as QueryFailure).message);
    }
    if ('e' in result) return result.e;
    const rows: Value[][] = [...(result.labels ? [result.labels] : []), ...result.rows];
    return rows.length > 0 ? { rows } : err('#N/A', 'Query completed with an empty output.');
  }),
};
