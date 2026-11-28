// A render's read of the page's workbook (docs/specs/003-system-architecture/react-state-and-effects.md "The React
// Compiler"). The workbook is one mutable copy whose identity never changes, so the compiler would keep a read memoised
// on the instance and its arguments; keyed on the store's version, it is read again whenever a value or a sheet may
// have changed. The version is the key alone: the read itself never looks at it.
export function readWorkbook<T>(_version: number, read: () => T): T {
  return read();
}
