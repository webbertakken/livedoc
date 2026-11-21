// formulas.md "Recalculation": in the browser the engine runs in a Worker and the page reads its copy of the values.
// The Worker's side (EngineHost) and the page's (EnginePort) are joined here in one process, as the Worker joins them.
import { describe, expect, it } from 'vitest';
import { cellKey, type Sheet } from '../sheet';
import { compileFormula } from '../formula/stored';
import { makeSheets } from '../testing/book';
import { readTypedInput } from '../typed-input';
import type { EngineIn, EngineOut } from './engine-protocol';
import { EngineHost } from './engine-host';
import { EnginePort } from './engine-port';
import { Workbook } from './workbook';
import { ITERATION_OFF } from './loops';
import { SheetLimits } from '../sheet-limits';
import { sheetToJson } from '../sheet-json';
import { IMPORT_WORDS, type ImportAccess, type ImportAsk } from '../imports/import-request';

type EnginePortImports = { access: ImportAccess; ask: (asks: ImportAsk[]) => void };
type Wire = { toHost: EngineIn[]; toPage: EngineOut[] };

function joined(sheets: Sheet[], imports?: EnginePortImports) {
  const wire: Wire = { toHost: [], toPage: [] };
  const host = new EngineHost((out) => wire.toPage.push(out));
  const port = new EnginePort({
    sheets,
    locale: 'en-GB',
    send: (m) => wire.toHost.push(m),
    ...(imports ? { imports } : {}),
  });
  port.start();
  // Deliver what each side sent: the page's messages first, then the Worker's answers part by part.
  const deliver = (parts = Infinity) => {
    for (const m of wire.toHost.splice(0)) host.receive(m);
    let n = 0;
    while (n++ < parts && host.work(0)) for (const out of wire.toPage.splice(0)) port.receive(out);
    for (const out of wire.toPage.splice(0)) port.receive(out);
  };
  // Retype a cell, as the store does: the page's copy of the sheet, then the Worker told.
  const set = (a1: string, text: string, sheetIndex = 0) => {
    const sheet = port.copy.sheetList()[sheetIndex]!;
    const r = Number(a1.slice(1)) - 1;
    const c = a1.charCodeAt(0) - 65;
    const key = cellKey(sheet.layout.rows[r]!, sheet.layout.cols[c]!);
    const read = readTypedInput(text, 'en-GB', port.copy.ctxFor(sheet.id));
    const cells = sheet.cells.copy();
    if (read.kind === 'value') cells.set(key, { input: read.input });
    else cells.delete(key);
    port.updateSheet({ ...sheet, cells }, [key]);
  };
  return {
    host,
    port,
    wire,
    deliver,
    set,
    v: (r: number, c: number, s = 0) => port.copy.value(port.copy.sheetList()[s]!.id, r, c),
  };
}

const SPEC = {
  One: {
    A1: '2',
    A2: '=A1*10',
    A3: '=SEQUENCE(3)',
    B1: '=Two!A1+A2',
    C1: '=HYPERLINK("https://docs.nu", "home")',
  },
  Two: { A1: '5', A2: '=SUM(One!A3:A5)' },
};

describe('the page’s copy of the Worker’s values', () => {
  it('holds every value the engine works out, spills and other sheets too', () => {
    const sheets = makeSheets(SPEC);
    const direct = new Workbook({ sheets, locale: 'en-GB' });
    const { deliver, port } = joined(makeSheets(SPEC));
    deliver();
    for (const [i, sheet] of sheets.entries())
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 4; c++)
          expect(
            port.copy.value(port.copy.sheetList()[i]!.id, r, c),
            `${sheet.title} ${r},${c}`,
          ).toEqual(direct.value(sheet.id, r, c));
    const one = port.copy.sheetList()[0]!.id;
    expect(port.copy.spillOwnerAt(one, 4, 0)).toEqual({ r: 2, c: 0 });
    expect(port.copy.formulaResult(one, 2, 0)).toEqual({ rows: [[1], [2], [3]] });
    expect(port.copy.hyperlinkOf(one, 0, 2)).toBe('https://docs.nu/');
  });

  it('shows a change’s last values, waiting, until the new ones arrive', () => {
    const { deliver, set, v, port } = joined(makeSheets(SPEC));
    deliver();
    set('A1', '3');
    const one = port.copy.sheetList()[0]!.id;
    expect(v(1, 0)).toBe(20);
    deliver(0);
    expect(port.copy.isStale(one, 1, 0)).toBe(true);
    expect(port.copy.isStale(one, 2, 0)).toBe(false);
    deliver();
    expect([v(1, 0), v(0, 1)]).toEqual([30, 35]);
    expect(port.copy.isStale(one, 1, 0)).toBe(false);
  });

  it('works a new formula out, and an emptied spill goes', () => {
    const { deliver, set, v } = joined(makeSheets(SPEC));
    deliver();
    set('D1', '=A1+1');
    set('A3', '');
    deliver();
    expect(v(0, 3)).toBe(3);
    expect([v(2, 0), v(3, 0)]).toEqual([null, null]);
  });

  it('keeps values with their cells as rows move, and drops values worked out before they moved', () => {
    const { deliver, port, wire, host } = joined(makeSheets(SPEC));
    deliver();
    const sheet = port.copy.sheetList()[0]!;
    // A change the Worker answers late: its answer arrives after the rows move.
    const cells = sheet.cells.copy();
    cells.set(cellKey(sheet.layout.rows[0]!, sheet.layout.cols[0]!), { input: { n: 4 } });
    port.updateSheet({ ...sheet, cells }, [cellKey(sheet.layout.rows[0]!, sheet.layout.cols[0]!)]);
    for (const m of wire.toHost.splice(0)) host.receive(m);
    while (host.work(Infinity));
    const late = wire.toPage.splice(0);
    const moved = {
      ...port.copy.sheet(sheet.id)!,
      layout: { ...sheet.layout, rows: ['new', ...sheet.layout.rows] },
    };
    port.updateSheet(moved);
    expect(port.copy.value(sheet.id, 2, 0)).toBe(20);
    expect(port.copy.isStale(sheet.id, 2, 0)).toBe(true);
    for (const out of late) port.receive(out);
    expect(port.copy.value(sheet.id, 1, 0)).toBe(4);
    expect(port.copy.value(sheet.id, 2, 0)).toBe(20);
    deliver();
    expect(port.copy.value(sheet.id, 2, 0)).toBe(40);
    expect(port.copy.isStale(sheet.id, 2, 0)).toBe(false);
  });

  it('follows a removed sheet, iterative calculation and the clock', () => {
    const { deliver, port, wire, host, v } = joined(
      makeSheets({ One: { A1: '=TODAY()', A2: '=(A2+10)/2', B1: '=Two!A1' }, Two: { A1: '7' } }),
    );
    deliver();
    expect(v(1, 0)).toMatchObject({ e: '#REF!' });
    port.setIteration({ on: true, max: 50, threshold: 0.05 });
    expect(v(1, 0)).toMatchObject({ e: '#REF!' });
    deliver();
    expect(v(1, 0)).toBe(9.9609375);
    port.removeSheet(port.copy.sheetList()[1]!.id);
    deliver();
    expect(v(0, 1)).toMatchObject({ e: '#REF!' });
    // TODAY moves on: the Worker says it waits, then sends it again.
    port.tick();
    for (const m of wire.toHost.splice(0)) host.receive(m);
    const one = port.copy.sheetList()[0]!.id;
    expect(wire.toPage).toContainEqual({
      t: 'stale',
      rev: expect.any(Number),
      sheetId: one,
      cells: [[0, 0]],
    });
    deliver();
    expect(typeof v(0, 0)).toBe('number');
  });

  it('works a rule out on the page, reading the copy', () => {
    const { deliver, port } = joined(makeSheets(SPEC));
    deliver();
    const one = port.copy.sheetList()[0]!;
    const rule = compileFormula('=A2*2', port.copy.ctxFor(one.id));
    if (!rule.ok) throw new Error('rule');
    expect(port.copy.evaluateAt(one.id, 0, 3, rule.formula)).toBe(40);
  });
});

describe('the Worker’s engine at its edges', () => {
  it('waits for its sheets, and passes over a sheet it does not have', () => {
    const out: EngineOut[] = [];
    const host = new EngineHost(
      (m) => out.push(m),
      () => 0,
    );
    host.receive({ t: 'tick', rev: 1 });
    expect(host.work(8)).toBe(false);
    expect(out).toEqual([]);
    const [sheet] = makeSheets({ S: { A1: '=1+1' } }, { rows: 2, cols: 2 });
    host.receive({
      t: 'load',
      rev: 2,
      sheets: [sheetToJson(sheet!)],
      locale: 'en-GB',
      limits: 'spreadsheet',
      iteration: ITERATION_OFF,
    });
    host.receive({ t: 'cells', rev: 3, sheetId: 'missing', cells: [] });
    host.receive({ t: 'remove', rev: 4, sheetId: sheet!.id });
    expect(host.work(8)).toBe(false);
    expect(out.filter((m) => m.t === 'values')).toEqual([]);
  });

  it('works a spreadsheet out to its limits, and leaves a Plan Sheet’s copy to them too', () => {
    const port = new EnginePort({
      sheets: makeSheets({ S: { A1: '1' } }),
      locale: 'en-GB',
      limits: SheetLimits.spreadsheet,
      send: () => undefined,
    });
    expect(port.copy.limits).toBe(SheetLimits.spreadsheet);
    // An answer about a sheet the page no longer has is dropped.
    port.receive({ t: 'values', rev: 9, sheetId: 'gone', cells: [[0, 0, 1]] });
    expect(port.copy.sheet('gone')).toBeUndefined();
  });

  // formulas.md "Locale": the spreadsheet's time zone reaches the Worker's engine.
  it('sends the time zone the Worker’s NOW reads', () => {
    const sent: EngineIn[] = [];
    const port = new EnginePort({
      sheets: makeSheets({ S: { A1: '=NOW()' } }),
      locale: 'en-GB',
      timeZone: 'Asia/Tokyo',
      send: (m) => sent.push(m),
    });
    port.start();
    expect(port.copy.timeZone).toBe('Asia/Tokyo');
    expect(sent[0]).toMatchObject({ t: 'load', timeZone: 'Asia/Tokyo' });
    const out: EngineOut[] = [];
    const host = new EngineHost((m) => out.push(m));
    host.receive(sent[0]!);
    host.work(Infinity);
    const values = out.find((m) => m.t === 'values');
    expect(values && values.t === 'values' && typeof values.cells[0]![2]).toBe('number');
  });

  // formulas.md, the file's meaning: a spreadsheet opened from a file is worked out in its standard's meaning.
  it('sends the spreadsheet’s meaning, and the Worker answers in it', () => {
    const answer = (meaning?: 'openformula') => {
      const sent: EngineIn[] = [];
      const port = new EnginePort({
        sheets: makeSheets({ S: { A1: '=PERMUTATIONA(3, 0)' } }),
        locale: 'en-GB',
        ...(meaning ? { meaning } : {}),
        send: (m) => sent.push(m),
      });
      port.start();
      const out: EngineOut[] = [];
      const host = new EngineHost((m) => out.push(m));
      host.receive(sent[0]!);
      host.work(Infinity);
      const values = out.find((m) => m.t === 'values');
      return { load: sent[0], value: values?.t === 'values' ? values.cells[0]![2] : undefined };
    };
    const opened = answer('openformula');
    expect(opened.load).toMatchObject({ t: 'load', meaning: 'openformula' });
    expect(opened.value).toBe(1);
    const made = answer();
    expect(made.load).not.toHaveProperty('meaning');
    expect(made.value).toMatchObject({ e: '#NUM!' });
  });

  it('says only a tracking engine can tell what it forgot', () => {
    const wb = new Workbook({ sheets: makeSheets({ S: { A1: '1' } }), locale: 'en-GB' });
    expect(() => wb.takeForgotten()).toThrow('trackForgotten');
  });
});

describe('Plan cards in the Worker', () => {
  it('works the card formulas out again when the cards change', () => {
    const { deliver, port, host, wire } = joined(makeSheets({ S: { A1: '=CARDCOUNT()' } }));
    deliver();
    expect(port.copy.value(port.copy.sheetList()[0]!.id, 0, 0)).toMatchObject({
      e: expect.any(String),
    });
    host.setCards({
      version: 1,
      cards: () => [{ key: 1 }, { key: 2 }],
      fieldOf: () => undefined,
      knowsField: () => true,
    });
    while (host.work(Infinity));
    for (const out of wire.toPage.splice(0)) port.receive(out);
    expect(port.copy.value(port.copy.sheetList()[0]!.id, 0, 0)).toBe(2);
    new EngineHost(() => undefined).setCards(null);
  });
});

describe('imports in the Worker', () => {
  const F = '=IMPORTDATA("https://example.com/a.csv")';

  it('asks the page, which fetches and answers; Allow Access and the hour reach the Worker', () => {
    const asked: ImportAsk[] = [];
    const { deliver, port, v } = joined(makeSheets({ S: { A1: F } }), {
      access: 'blocked',
      ask: (asks) => asked.push(...asks),
    });
    deliver();
    expect(v(0, 0)).toMatchObject({ e: '#REF!' });
    port.allowImports();
    deliver();
    expect(v(0, 0)).toMatchObject({ why: 'pending' });
    expect(asked).toHaveLength(1);
    port.landImport(asked[0]!.key, { rows: [['a', 'b']] });
    deliver();
    expect([v(0, 0), v(0, 1)]).toEqual(['a', 'b']);
    port.refreshImports('web');
    deliver();
    expect(asked).toHaveLength(2);
    expect(v(0, 0)).toBe('a');
  });

  it('fetches at once where access was allowed before', () => {
    const asked: ImportAsk[] = [];
    const { deliver, v } = joined(makeSheets({ S: { A1: F } }), {
      access: 'allowed',
      ask: (asks) => asked.push(...asks),
    });
    deliver();
    expect(v(0, 0)).toMatchObject({ why: 'pending' });
    expect(asked).toHaveLength(1);
  });

  it('waits in This Browser until synced, then for Allow Access, or fetches when already allowed', () => {
    for (const allowed of [false, true]) {
      const asked: ImportAsk[] = [];
      const { deliver, port, v } = joined(makeSheets({ S: { A1: F } }), {
        access: 'offline',
        ask: (asks) => asked.push(...asks),
      });
      deliver();
      expect(v(0, 0)).toEqual({ e: '#REF!', why: IMPORT_WORDS.offline });
      expect(asked).toEqual([]);
      port.onlineImports(allowed);
      deliver();
      if (allowed) expect(v(0, 0)).toMatchObject({ why: 'pending' });
      else expect(v(0, 0)).toEqual({ e: '#REF!', why: IMPORT_WORDS.blocked });
      expect(asked).toHaveLength(allowed ? 1 : 0);
    }
  });

  it('fetches nothing for a page that does not', () => {
    const { deliver, port, v, wire } = joined(makeSheets({ S: { A1: F } }));
    deliver();
    expect(v(0, 0)).toMatchObject({ e: '#N/A' });
    port.receive({ t: 'imports', rev: 1, asks: [] });
    expect(wire.toHost).toEqual([]);
  });
});
