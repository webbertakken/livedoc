// A stored reference's shape as the wire and the room carry it (docs/specs/029-sheets/sheet-store.md "Rows and
// columns by id"): every key known, each part well made.
import { isAxisId, isSheetId } from '../ids';
import { SHEET_TITLE_MAX } from '../limits';
import type { StoredRef } from '../sheet';

export function isStoredRef(v: unknown): v is StoredRef {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  for (const [k, x] of Object.entries(r)) {
    switch (k) {
      case 's':
        if (!isSheetId(x)) return false;
        break;
      case 'st':
        if (typeof x !== 'string' || x.length === 0 || x.length > SHEET_TITLE_MAX) return false;
        break;
      case 'r1':
      case 'c1':
      case 'r2':
      case 'c2':
      case 't':
      case 'tc1':
      case 'tc2':
        if (!isAxisId(x)) return false;
        break;
      case 'a':
        if (!Number.isInteger(x) || (x as number) < 0 || (x as number) > 15) return false;
        break;
      case 'open':
        if (x !== 'r' && x !== 'c') return false;
        break;
      case 'ta':
        if (!Number.isInteger(x) || (x as number) < 1 || (x as number) > 15) return false;
        break;
      case 'spill':
        if (x !== true) return false;
        break;
      case 'p':
        if (
          !Array.isArray(x) ||
          x.length !== 4 ||
          !x.every((n) => Number.isInteger(n) && n >= -1 && n < 1e6)
        )
          return false;
        break;
      default:
        return false;
    }
  }
  // A table reference names its table and nothing of a cell reference's.
  if (r.t !== undefined)
    return (
      (r.tc2 === undefined || r.tc1 !== undefined) &&
      ['r1', 'c1', 'r2', 'c2', 'a', 'open', 'spill', 'st', 'p'].every((k) => r[k] === undefined)
    );
  return r.tc1 === undefined && r.tc2 === undefined && r.ta === undefined;
}
