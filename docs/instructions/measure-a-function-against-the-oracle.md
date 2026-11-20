# Measure a function against the oracle

How a spreadsheet function is proven to answer as Google Sheets does ([Formulas](../specs/029-sheets/formulas.md#the-oracle)).
The corpus lives in `packages/sheets/oracle/` ([its README](../../packages/sheets/oracle/README.md)).

1. Open the category file `packages/sheets/oracle/cases/<Category>.json`, or make it with `category`, `data`, `cases`.
2. Read the function's Google help page (`support.google.com/docs`) for its arguments, defaults and errors.
3. Put the inputs the cases need into the category's `data` (sheet `Data` from A1); never an error in a fixture.
4. Write cases as Google's syntax, `=` first: the plain use, each optional argument, each documented error, an empty
   cell, text where a number goes, a range where a value goes, and an array result with its `rows` and `cols`.
5. Give each case the id `<NAME>.<n>`, numbered on from the last; never renumber or reuse an id.
6. Run `pnpm --filter @livedoc/sheets oracle:libreoffice` (one category: `ORACLE_CATEGORY=<Category>` before it).
7. Run `npx prettier --write` on the new answers file (the script writes plain JSON; the pre-push check refuses it).
   Read the new answers in `oracle/answers/libreoffice/<Category>.json`; a `Err:5xx` is LibreOffice's own error.
8. Where LibreOffice answers otherwise than Google documents, add `differs.libreoffice` with why, and the documented
   answer as `expect` with `cite` (the help page's address and what it says); never type an answer without a cite.
9. A Google-only function (ODF name S5, written `ORG.LIVEDOC.`) is `#NAME?` in LibreOffice: give each of its cases
   `expect` and `cite` from its help page, and `differs.libreoffice` saying so.
10. Where Google's answers exist (`oracle/answers/google/`), they win; run `oracle:google` when its downloads are new.
11. Run `pnpm --filter @livedoc/sheets exec vitest run src/oracle --silent=false` and read `[sheets oracle]` lines.
12. Fix the engine until the category passes; never loosen a case's `tol` past one in a million, and say why in `note`.
13. Mark the function **built** in `formulas.md`'s catalogue only once its cases pass.
14. Add the category to `MEASURED_CATEGORIES` in `src/oracle/oracle.test.ts` once all its functions are measured.
15. A new function family in the registry needs its label in `SheetFunctionMenu.tsx` and its icon in `sheet-icons.tsx`.
