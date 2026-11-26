// An agent's validation and format rules (docs/specs/029-sheets/data-validation.md, conditional-formatting.md
// "Agents"): built by the engine's commands, refused in words, and read back.
import { describe, expect, it } from 'vitest';
import {
  CellMap,
  NOBODY,
  Workbook,
  applySheetWrite,
  emptyLayout,
  type Sheet,
} from '@livedoc/sheets';
import { buildSheetChange, type SheetChange } from './sheet-change-build';
import { AGENT_CONDITIONS, rulesRead } from './sheet-rule-change';

let n = 1;
const rand = () => ((n = (n * 16807) % 2147483647), n / 2147483647);

function book() {
  n = 7;
  const sheet: Sheet = {
    id: 'sheet_rules1',
    tabId: 'tab',
    title: 'Rules',
    layout: emptyLayout(rand, 20, 6),
    cells: new CellMap(),
    rev: 0,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: NOBODY,
  };
  const wb = new Workbook({ sheets: [sheet], locale: 'en-GB' });
  // Build and apply, as the api would.
  const run = (change: SheetChange) => {
    const built = buildSheetChange(wb, sheet.id, change, [], rand);
    if (!built.ok) return built;
    for (const w of built.writes) {
      const next = applySheetWrite(wb.sheet(sheet.id)!, w, {
        now: 1,
        by: NOBODY,
      }).sheet;
      wb.updateSheet(next);
    }
    return built;
  };
  return { wb, id: sheet.id, run };
}

describe('validation rules for agents', () => {
  it('makes a dropdown, refuses a value it does not allow, and saves an option in its own spelling', () => {
    const { wb, id, run } = book();
    expect(
      run({
        op: 'validate',
        range: 'B2:B10',
        rule: {
          type: 'dropdown',
          options: ['To Do', 'Done'],
          colors: ['#ff0000', null],
          display: 'arrow',
        },
      }),
    ).toMatchObject({ ok: true, line: 'made B2:B10 a dropdown rule' });
    const refused = run({ op: 'set', at: 'B3', rows: [['Blocked']] });
    expect(refused).toMatchObject({ ok: false, code: 'value_invalid' });
    expect(!refused.ok && refused.message).toMatch(/^B3 cannot take that value: Choose one of/);
    expect(run({ op: 'set', at: 'B3', rows: [['done']] }).ok).toBe(true);
    expect(wb.value(id, 2, 1)).toBe('Done');
    const read = rulesRead(wb, id);
    expect(read.validation).toEqual([
      expect.objectContaining({
        range: 'B2:B10',
        type: 'dropdown',
        options: ['To Do', 'Done'],
        reject: true,
      }),
    ]);
  });
  it('makes checkbox, number, date, text and range rules, and clears them', () => {
    const { wb, id, run } = book();
    expect(run({ op: 'validate', range: 'A1:A5', rule: { type: 'checkbox' } }).ok).toBe(true);
    expect(
      run({
        op: 'validate',
        range: 'C1:C5',
        rule: { type: 'number', condition: 'between', value: 1, value2: 5 },
        reject: false,
        help: 'One to five',
      }).ok,
    ).toBe(true);
    expect(
      run({
        op: 'validate',
        range: 'D1',
        rule: { type: 'date', condition: 'after', value: '2026-10-01' },
      }).ok,
    ).toBe(true);
    expect(
      run({ op: 'validate', range: 'D2', rule: { type: 'date', condition: 'valid' } }).ok,
    ).toBe(true);
    expect(
      run({ op: 'validate', range: 'E1', rule: { type: 'text', condition: 'email' } }).ok,
    ).toBe(true);
    expect(
      run({
        op: 'validate',
        range: 'E2',
        rule: { type: 'text', condition: 'contains', value: 'ref' },
      }).ok,
    ).toBe(true);
    expect(
      run({ op: 'validate', range: 'F1', rule: { type: 'dropdown_range', source: 'A10:A12' } }).ok,
    ).toBe(true);
    const read = rulesRead(wb, id).validation;
    expect(read.map((r) => r.type)).toEqual([
      'checkbox',
      'number',
      'date',
      'date',
      'text',
      'text',
      'dropdown_range',
    ]);
    expect(read[1]).toMatchObject({ condition: 'between', reject: false, help: 'One to five' });
    expect(read[6]).toMatchObject({ source: 'A10:A12' });
    expect(run({ op: 'clear_validation', range: 'A1:E5' }).ok).toBe(true);
    expect(rulesRead(wb, id).validation.map((r) => r.range)).toEqual(['F1']);
  });
  it('makes a dropdown allowing multiple selections, saving each option in its own spelling', () => {
    const { wb, id, run } = book();
    expect(
      run({
        op: 'validate',
        range: 'B1:B3',
        rule: { type: 'dropdown', options: ['To Do', 'Done'], multiple: true },
      }).ok,
    ).toBe(true);
    expect(run({ op: 'set', at: 'B1', rows: [['done,to do']] }).ok).toBe(true);
    expect(wb.value(id, 0, 1)).toBe('Done, To Do');
    expect(run({ op: 'set', at: 'B2', rows: [['Done, Blocked']] })).toMatchObject({
      ok: false,
      code: 'value_invalid',
    });
    expect(rulesRead(wb, id).validation[0]).toMatchObject({ multiple: true });
  });
  it('makes a dropdown from a range on another sheet, and reads it back by that sheet', () => {
    const { wb, id, run } = book();
    const other: Sheet = {
      ...wb.sheet(id)!,
      id: 'sheet_lists1',
      title: 'My Lists',
      cells: new CellMap(),
    };
    wb.updateSheet(other);
    const lists = wb.sheet('sheet_lists1')!;
    wb.updateSheet(
      applySheetWrite(
        lists,
        {
          kind: 'cells',
          cells: [{ r: lists.layout.rows[0]!, c: lists.layout.cols[0]!, i: { s: 'Red' } }],
        },
        { now: 1, by: NOBODY },
      ).sheet,
    );
    expect(
      run({
        op: 'validate',
        range: 'A1:A3',
        rule: { type: 'dropdown_range', source: "'My Lists'!A1:A2" },
      }).ok,
    ).toBe(true);
    expect(rulesRead(wb, id).validation[0]).toMatchObject({ source: "'My Lists'!A1:A2" });
    expect(run({ op: 'set', at: 'A1', rows: [['Blue']] })).toMatchObject({
      ok: false,
      code: 'value_invalid',
    });
    expect(run({ op: 'set', at: 'A1', rows: [['red']] }).ok).toBe(true);
    expect(
      run({ op: 'validate', range: 'A1', rule: { type: 'dropdown_range', source: 'Nope!A1' } }),
    ).toMatchObject({ ok: false, code: 'range_invalid' });
  });
  it('makes custom checkboxes and custom formula rules, checked as the editor checks them', () => {
    const { wb, id, run } = book();
    expect(
      run({
        op: 'validate',
        range: 'A1:A5',
        rule: { type: 'checkbox', checked: 'Yes', unchecked: 'No' },
      }).ok,
    ).toBe(true);
    expect(run({ op: 'set', at: 'A1', rows: [['yes']] }).ok).toBe(true);
    expect(wb.value(id, 0, 0)).toBe('Yes');
    expect(run({ op: 'set', at: 'A2', rows: [['TRUE']] })).toMatchObject({
      ok: false,
      code: 'value_invalid',
    });
    expect(
      run({ op: 'validate', range: 'C1:C5', rule: { type: 'formula', formula: 'C1>B1' } }),
    ).toMatchObject({ ok: true, line: 'made C1:C5 a formula rule' });
    expect(run({ op: 'set', at: 'B1', rows: [[5]] }).ok).toBe(true);
    const refused = run({ op: 'set', at: 'C1', rows: [[2]] });
    expect(!refused.ok && refused.message).toMatch(/meets the rule's formula/);
    expect(run({ op: 'set', at: 'C1', rows: [[9]] }).ok).toBe(true);
    expect(rulesRead(wb, id).validation).toEqual([
      expect.objectContaining({
        range: 'A1:A5',
        type: 'checkbox',
        checked: 'Yes',
        unchecked: 'No',
      }),
      expect.objectContaining({ range: 'C1:C5', type: 'formula', formula: '=C1>B1' }),
    ]);
    const code = (c: SheetChange) => {
      const r = run(c);
      return r.ok ? null : r.code;
    };
    expect(code({ op: 'validate', range: 'A1', rule: { type: 'checkbox', unchecked: 'No' } })).toBe(
      'rule_invalid',
    );
    expect(
      code({
        op: 'validate',
        range: 'A1',
        rule: { type: 'checkbox', checked: 'a', unchecked: 'A' },
      }),
    ).toBe('rule_invalid');
    for (const checked of [Infinity, ' ', 'x'.repeat(256)])
      expect(code({ op: 'validate', range: 'A1', rule: { type: 'checkbox', checked } })).toBe(
        'rule_invalid',
      );
    expect(run({ op: 'validate', range: 'E1', rule: { type: 'checkbox', checked: 1 } }).ok).toBe(
      true,
    );
    for (const formula of ['', undefined as never as string])
      expect(code({ op: 'validate', range: 'A1', rule: { type: 'formula', formula } })).toBe(
        'formula_invalid',
      );
    expect(code({ op: 'validate', range: 'A1', rule: { type: 'formula', formula: '=(' } })).toBe(
      'formula_invalid',
    );
  });
  it('refuses what cannot be a rule', () => {
    const { run } = book();
    const code = (c: SheetChange) => {
      const r = run(c);
      return r.ok ? null : r.code;
    };
    expect(code({ op: 'validate', range: 'Z99', rule: { type: 'checkbox' } })).toBe(
      'range_invalid',
    );
    expect(code({ op: 'validate', range: 'A1', rule: { type: 'dropdown', options: [''] } })).toBe(
      'rule_invalid',
    );
    expect(
      code({ op: 'validate', range: 'A1', rule: { type: 'dropdown_range', source: 'nope' } }),
    ).toBe('range_invalid');
    expect(
      code({ op: 'validate', range: 'A1', rule: { type: 'number', condition: 'nearly' } }),
    ).toBe('rule_invalid');
    expect(
      code({
        op: 'validate',
        range: 'A1',
        rule: { type: 'number', condition: 'between', value: 1 },
      }),
    ).toBe('rule_invalid');
    expect(
      code({
        op: 'validate',
        range: 'A1',
        rule: { type: 'date', condition: 'on', value: '1/2/3' },
      }),
    ).toBe('rule_invalid');
    expect(
      code({ op: 'validate', range: 'A1', rule: { type: 'text', condition: 'contains' } }),
    ).toBe('rule_invalid');
    expect(code({ op: 'validate', range: 'A1', rule: { type: 'nope' } as never })).toBe(
      'rule_invalid',
    );
    expect(code({ op: 'clear_validation', range: 'nope' })).toBe('range_invalid');
  });
});

describe('format rules for agents', () => {
  it('adds conditions, formulas and scales in order, reads them back, and clears them', () => {
    const { wb, id, run } = book();
    expect(
      run({
        op: 'conditional_format',
        range: 'B2:B10',
        when: { condition: 'greater_than', value: 100 },
        style: { background: '#F4C7C3', bold: true },
      }).ok,
    ).toBe(true);
    expect(
      run({
        op: 'conditional_format',
        range: 'A2:F10',
        when: { condition: 'formula', formula: '=$C2>100' },
        style: { color: '#137333', italic: true, underline: true, strikethrough: true },
      }).ok,
    ).toBe(true);
    expect(
      run({
        op: 'conditional_format',
        range: 'D2:D10',
        scale: {
          min: { color: '#ffffff', type: 'min' },
          mid: { color: '#ffd666', type: 'percentile', value: 50 },
          max: { color: '#57bb8a', type: 'max' },
        },
      }).ok,
    ).toBe(true);
    const read = rulesRead(wb, id).conditionalFormats;
    expect(read.map((r) => r.rule)).toEqual([
      'Greater Than 100',
      'Custom Formula Is =$C2>100',
      'Colour Scale',
    ]);
    expect(read[0]).toMatchObject({ range: 'B2:B10', style: { bg: '#f4c7c3', b: true } });
    // Asked to go first, a rule goes ahead of the rest.
    const first = run({
      op: 'conditional_format',
      range: 'F12:F14',
      when: { condition: 'empty' },
      style: { background: '#eeeeee' },
      first: true,
    });
    expect(first).toMatchObject({
      ok: true,
      line: 'added a format rule to F12:F14, first in the list',
    });
    expect(rulesRead(wb, id).conditionalFormats.map((r) => r.rule)[0]).toBe('Is Empty');
    run({ op: 'clear_conditional_formats', range: 'F12:F14' });
    expect(run({ op: 'clear_conditional_formats', range: 'B5' })).toMatchObject({
      ok: true,
      line: 'cleared 2 format rules',
    });
    expect(run({ op: 'clear_conditional_formats' })).toMatchObject({
      ok: true,
      line: 'cleared 1 format rule',
    });
    expect(run({ op: 'clear_conditional_formats' })).toMatchObject({ ok: true, writes: [] });
    expect(AGENT_CONDITIONS).toContain('greater_than_or_equal');
    expect(AGENT_CONDITIONS).toContain('starts_with');
  });
  it('takes a range of several rectangles, and reads and clears it by any of them', () => {
    const { wb, id, run } = book();
    expect(
      run({
        op: 'conditional_format',
        range: 'A1:A3, C2:C4',
        when: { condition: 'formula', formula: '=$D1>0' },
        style: { bold: true },
      }),
    ).toMatchObject({ ok: true, line: 'added a format rule to A1:A3,C2:C4' });
    expect(rulesRead(wb, id).conditionalFormats[0]).toMatchObject({ range: 'A1:A3,C2:C4' });
    expect(run({ op: 'clear_conditional_formats', range: 'C4' })).toMatchObject({
      line: 'cleared 1 format rule',
    });
    expect(
      run({ op: 'conditional_format', range: 'A1,Q99', when: { condition: 'empty' } }),
    ).toMatchObject({ ok: false, code: 'range_invalid' });
  });
  it('refuses what cannot be a format rule', () => {
    const { run } = book();
    const code = (c: SheetChange) => {
      const r = run(c);
      return r.ok ? null : r.code;
    };
    expect(code({ op: 'conditional_format', range: 'Q99' })).toBe('range_invalid');
    expect(code({ op: 'conditional_format', range: 'nope' })).toBe('range_invalid');
    expect(code({ op: 'conditional_format', range: 'A1' })).toBe('rule_invalid');
    expect(code({ op: 'conditional_format', range: 'A1', when: { condition: 'empty' } })).toBe(
      'format_invalid',
    );
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        when: { condition: 'empty' },
        style: { color: 'red' },
      }),
    ).toBe('format_invalid');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        when: { condition: 'nope' },
        style: { bold: true },
      }),
    ).toBe('rule_invalid');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        when: { condition: 'formula', formula: '=(' },
        style: { bold: true },
      }),
    ).toBe('formula_invalid');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        scale: { min: { color: '#fff', type: 'min' }, max: { color: '#000000', type: 'max' } },
      }),
    ).toBe('rule_invalid');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        scale: {
          min: { color: '#ffffff', type: 'number' },
          max: { color: '#000000', type: 'max' },
        },
      }),
    ).toBe('rule_invalid');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        scale: {
          min: { color: '#ffffff', type: 'nope' as never },
          max: { color: '#000000', type: 'max' },
        },
      }),
    ).toBe('rule_invalid');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        scale: { min: undefined as never, max: { color: '#000000', type: 'max' } },
      }),
    ).toBe('rule_invalid');
    expect(code({ op: 'clear_conditional_formats', range: 'nope' })).toBe('range_invalid');
  });
});

describe('the rest of the words', () => {
  it('reads a number for a date, refuses missing values, and takes formulas without their =', () => {
    const { wb, id, run } = book();
    const code = (c: SheetChange) => {
      const r = run(c);
      return r.ok ? null : r.message;
    };
    expect(
      run({ op: 'validate', range: 'A1', rule: { type: 'date', condition: 'on', value: 46300 } })
        .ok,
    ).toBe(true);
    expect(
      code({
        op: 'validate',
        range: 'A1',
        rule: { type: 'date', condition: 'on', value: Number.NaN },
      }),
    ).toMatch(/as dates/);
    expect(
      code({
        op: 'validate',
        range: 'A1',
        rule: { type: 'date', condition: 'between', value: '2026-01-01' },
      }),
    ).toBe('Give value and value2 as dates, YYYY-MM-DD.');
    expect(
      code({ op: 'validate', range: 'A1', rule: { type: 'number', condition: 'greater_than' } }),
    ).toBe('Give value as numbers.');
    expect(
      code({
        op: 'conditional_format',
        range: 'A1',
        when: { condition: 'formula' },
        style: { bold: true },
      }),
    ).toMatch(/cannot be read/);
    expect(
      run({
        op: 'conditional_format',
        range: 'A1:A3',
        when: { condition: 'formula', formula: 'A1>1' },
        style: { bold: true },
      }).ok,
    ).toBe(true);
    expect(
      run({
        op: 'conditional_format',
        range: 'B1',
        when: { condition: 'not_empty' },
        style: { italic: true },
      }).ok,
    ).toBe(true);
    expect(
      run({
        op: 'conditional_format',
        range: 'C1:C5',
        scale: {
          min: { color: '#ffffff', type: 'number', value: 0 },
          max: { color: '#000000', type: 'percent', value: 90 },
        },
      }).ok,
    ).toBe(true);
    expect(run({ op: 'clear_validation', range: 'F20' })).toMatchObject({ ok: true, writes: [] });
    expect(
      run({
        op: 'conditional_format',
        range: 'D1',
        when: { condition: 'between', value: 1, value2: 5 },
        style: { bold: true },
      }).ok,
    ).toBe(true);
    // A dropdown from a range is checked against the range's values.
    expect(run({ op: 'set', at: 'E10', rows: [['Red'], ['Blue']] }).ok).toBe(true);
    expect(
      run({ op: 'validate', range: 'E1:E5', rule: { type: 'dropdown_range', source: 'E10:E11' } })
        .ok,
    ).toBe(true);
    expect(run({ op: 'set', at: 'E2', rows: [['Green']] })).toMatchObject({
      ok: false,
      code: 'value_invalid',
    });
    expect(run({ op: 'set', at: 'E2', rows: [['blue']] }).ok).toBe(true);
    const read = rulesRead(wb, id);
    expect(read.conditionalFormats.map((r) => r.rule)).toEqual([
      'Custom Formula Is =A1>1',
      'Is Not Empty',
      'Colour Scale',
      'Is Between 1 and 5',
    ]);
    expect(read.conditionalFormats[2]).toMatchObject({
      scale: { min: { at: 'num', v: 0 }, max: { at: 'pct', v: 90 } },
    });
    expect(read.conditionalFormats[2]!.scale).not.toHaveProperty('mid');
    expect(read.validation[0]).toMatchObject({ type: 'date', condition: 'on' });
  });
});
