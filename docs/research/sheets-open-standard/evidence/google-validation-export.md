# Google Sheets' data validation in XLSX and ODS (measured 2026-11-26)

Probe: `google-validation-probe.ts` (Sheets API `setDataValidation`, one rule per column of B2:B6-style ranges, a
range dropdown reading `'My Lists'!A1:A3`, then Drive export both ways).

## XLSX (`worksheet/dataValidations`)

| Criterion                    | Written                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Dropdown (list)              | `type="list"`, `formula1` `"To Do,Doing,Done"`                                                     |
| Dropdown from a Range        | `type="list"`, `formula1` `'My Lists'!$A$1:$A$3`                                                   |
| Checkbox (plain, custom, 1)  | **not written**                                                                                    |
| Number between, not between  | `type="decimal"` (`operator="notBetween"`), `formula1` `1.0`, `formula2` `10.0`                    |
| Number > / ≠                 | `type="decimal" operator="greaterThan"` / `"notEqual"`                                             |
| Date after / on or before    | `type="date" operator="greaterThan"` / `"lessThanOrEqual"`, day numbers `46296.0`                  |
| Date between                 | `type="date"`, two formulas                                                                        |
| Date is valid                | `type="custom"` `OR(NOT(ISERROR(DATEVALUE(J2))), AND(ISNUMBER(J2), LEFT(CELL("format", J2))="D"))` |
| Text contains / not contains | `type="custom"` `NOT(ISERROR(SEARCH(("ref"),(N2))))` / `ISERROR(SEARCH(("x"),(O2)))`               |
| Text is exactly              | **not written**                                                                                    |
| Email / URL                  | `type="custom"` `IFERROR(ISEMAIL(Q2), true)` / `IFERROR(ISURL(R2), true)`                          |
| Custom formula               | `type="custom"` `B2>A2`                                                                            |

- Every rule `allowBlank="1"`; a strict (Reject) rule adds `showErrorMessage="1"`, a Warn rule has none (Excel then
  checks nothing). Help text is the input message: `showInputMessage="1" prompt="..."`. No `extLst`.

## ODS (`table:content-validations`, cells name them by `table:content-validation-name`)

- List `of:cell-content-is-in-list("To Do";"Doing";"Done")`, range `of:cell-content-is-in-list([$'My Lists'.$A$1:.$A$3])`,
  both `table:display-list="unsorted"`; numbers `of:cell-content-is-decimal-number() and cell-content-is-between(1,10)`,
  `... and cell-content()>5`, `!=5`; dates `of:cell-content-is-date() and cell-content()>46296`, `is-between(a,b)`.
- Custom formulas (valid date, contains, not contains, email, URL, custom) come out malformed:
  `of: and cell-content-is-between(FORMULA,0)`.
- Strict: `<table:error-message table:message-type="stop" table:display="true"/>`; Warn: no error message. Help text:
  `<table:help-message table:display="true"><text:p>…</text:p></table:help-message>`.
- `table:base-cell-address` is the rule's top-left; checkboxes and Text is exactly are not written.
