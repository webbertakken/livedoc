// A validation rule's two forms in a file (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D289 to
// D292): the closest standard rule for every criterion, the standard rule read back as LiveDoc's closest, LiveDoc's
// own rule as JSON, and the fingerprint that tells a standard rule changed by another app.
import { describe, expect, it } from 'vitest';
import type { FileValidationSettings } from './file-validation';
import {
  liveDocRuleFrom,
  liveDocRuleText,
  readValidation,
  settingsFromStandard,
  standardRuleOf,
  validationFingerprint,
  type StandardRule,
} from './validation-standard';

const std = (rule: FileValidationSettings) => standardRuleOf(rule, 'B2');

describe('the standard rule closest to each criterion', () => {
  it('writes dropdowns as lists, a range as its range, and checkboxes as their two values', () => {
    expect(
      std({ is: 'list', opts: [{ v: 'To Do', c: '#ff0000' }, { v: 'Done' }], multi: true }),
    ).toEqual({
      check: { k: 'list', items: ['To Do', 'Done'] },
      strict: true,
    });
    expect(std({ is: 'range', src: "'My Lists'!A1:A3" }).check).toEqual({
      k: 'range',
      src: "'My Lists'!A1:A3",
    });
    expect(std({ is: 'range' }).check).toEqual({ k: 'any' });
    expect(std({ is: 'check' }).check).toEqual({ k: 'list', items: ['TRUE', 'FALSE'] });
    expect(std({ is: 'check', on: 1, off: 'No' }).check).toEqual({ k: 'list', items: ['1', 'No'] });
    expect(std({ is: 'check', on: 'Yes' }).check).toEqual({ k: 'list', items: ['Yes'] });
  });

  it('writes numbers and dates by operator, a valid date and text as formulas', () => {
    expect(std({ is: 'num', op: 'between', a: 1, b: 10 }).check).toEqual({
      k: 'num',
      op: 'between',
      a: 1,
      b: 10,
    });
    expect(std({ is: 'date', op: 'onOrBefore', a: 46296 }).check).toEqual({
      k: 'date',
      op: 'lte',
      a: 46296,
    });
    expect(std({ is: 'date', op: 'valid' }).check).toEqual({
      k: 'formula',
      fx: '=OR(NOT(ISERROR(DATEVALUE(B2))),AND(ISNUMBER(B2),LEFT(CELL("format",B2))="D"))',
    });
    const fx = (op: FileValidationSettings['op'], a?: string) =>
      std({ is: 'text', op, ...(a === undefined ? {} : { a }) }).check;
    expect(fx('contains', 'say "hi"')).toEqual({
      k: 'formula',
      fx: '=NOT(ISERROR(SEARCH("say ""hi""",B2)))',
    });
    expect(fx('notContains', 'x')).toEqual({ k: 'formula', fx: '=ISERROR(SEARCH("x",B2))' });
    expect(fx('exactly', 'Yes')).toEqual({ k: 'formula', fx: '=B2="Yes"' });
    expect(fx('email')).toEqual({ k: 'formula', fx: '=IFERROR(ISEMAIL(B2),TRUE)' });
    expect(fx('url')).toEqual({ k: 'formula', fx: '=IFERROR(ISURL(B2),TRUE)' });
  });

  it('writes a custom formula as it is, a warning as not strict, and help as the input message', () => {
    expect(std({ is: 'formula', fx: '=B2>A2', warn: true, help: 'Bigger' })).toEqual({
      check: { k: 'formula', fx: '=B2>A2' },
      strict: false,
      help: 'Bigger',
    });
    expect(std({ is: 'formula' }).check).toEqual({ k: 'any' });
  });
});

describe('a standard rule read as LiveDoc’s closest', () => {
  const read = (check: StandardRule['check'], strict = true, help?: string) =>
    settingsFromStandard({ check, strict, ...(help ? { help } : {}) });
  it('reads each check back, a date’s operator as a date’s, a warning and help', () => {
    expect(read({ k: 'list', items: ['TRUE', 'FALSE'] })).toEqual({
      is: 'list',
      opts: [{ v: 'TRUE' }, { v: 'FALSE' }],
    });
    expect(read({ k: 'range', src: 'A1:A3' }, false, 'Pick')).toEqual({
      is: 'range',
      src: 'A1:A3',
      warn: true,
      help: 'Pick',
    });
    expect(read({ k: 'formula', fx: '=A1>0' })).toEqual({ is: 'formula', fx: '=A1>0' });
    expect(read({ k: 'num', op: 'neq', a: 5 })).toEqual({ is: 'num', op: 'neq', a: 5 });
    expect(read({ k: 'date', op: 'between', a: 1, b: 2 })).toEqual({
      is: 'date',
      op: 'between',
      a: 1,
      b: 2,
    });
    expect(read({ k: 'date', op: 'gte', a: 1 })).toEqual({ is: 'date', op: 'onOrAfter', a: 1 });
    expect(read({ k: 'date', op: 'neq', a: 1 })).toBeNull();
    expect(read({ k: 'any' })).toBeNull();
  });
});

describe('LiveDoc’s rule beside the standard one', () => {
  const rule: FileValidationSettings = {
    is: 'list',
    opts: [{ v: 'A', c: '#00ff00' }],
    show: 'plain',
    multi: true,
  };
  const standard: StandardRule = { check: { k: 'list', items: ['A'] }, strict: true };
  const fp = validationFingerprint(['list', '"A"']);

  it('holds the settings as JSON and reads only an object back', () => {
    expect(liveDocRuleFrom(liveDocRuleText(rule))).toEqual(rule);
    expect(liveDocRuleFrom('[1]')).toBeNull();
    expect(liveDocRuleFrom('null')).toBeNull();
    expect(liveDocRuleFrom('{nope')).toBeNull();
  });

  it('fingerprints the standard rule’s lines as 8 hex digits, each line counting', () => {
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(validationFingerprint(['list', '"B"'])).not.toBe(fp);
    expect(validationFingerprint([''])).toBe('00000000');
  });

  it('takes LiveDoc’s rule while its fingerprint matches, else the standard rule, named as changed', () => {
    const liveDoc = { rule: liveDocRuleText(rule), fingerprint: fp };
    expect(readValidation(standard, fp, liveDoc)).toEqual({ settings: rule, changed: false });
    expect(readValidation(null, fp, liveDoc)).toEqual({ settings: rule, changed: false });
    const other = validationFingerprint(['list', '"A,B"']);
    expect(readValidation(standard, other, liveDoc)).toEqual({
      settings: { is: 'list', opts: [{ v: 'A' }] },
      changed: true,
    });
    expect(readValidation(standard, fp, { rule: 'broken', fingerprint: fp })).toEqual({
      settings: { is: 'list', opts: [{ v: 'A' }] },
      changed: true,
    });
    expect(readValidation(standard, fp, undefined)).toEqual({
      settings: { is: 'list', opts: [{ v: 'A' }] },
      changed: false,
    });
    expect(readValidation(null, fp, undefined)).toBeNull();
    expect(readValidation({ check: { k: 'any' }, strict: true }, other, liveDoc)).toBeNull();
  });
});
