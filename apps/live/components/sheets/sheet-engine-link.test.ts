// formulas.md "Recalculation": the store reaches its engine through a Web Worker, or in place without one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CARDS_UNSET, ITERATION_OFF, type SheetJson } from '@livedoc/sheets';
import { EngineHosts, type FromEngine } from './sheet-engine-hosts';
import { engineLink, inPlaceLink, workerLink } from './sheet-engine-link';

// One sheet whose A1 counts the Plan cards.
const SHEET: SheetJson = {
  id: 'sheetOne1',
  tabId: 't1',
  title: 'S',
  layout: { rows: ['r1'], cols: ['c1'] },
  cells: [{ r: 'r1', c: 'c1', i: { f: { t: 'CARDCOUNT()', r: [] } } }],
  rev: 0,
  createdAt: 0,
  updatedAt: 0,
  updatedBy: { id: '', name: '', color: '#000000' },
};

const load = (rev: number) => ({
  t: 'load' as const,
  rev,
  sheets: [SHEET],
  locale: 'en-GB',
  limits: 'plan' as const,
  iteration: ITERATION_OFF,
});

describe('EngineHosts', () => {
  it('keeps an engine per scope, reads cards as the engine does, and drops a scope', () => {
    const heard: FromEngine[] = [];
    const hosts = new EngineHosts(
      (m) => heard.push(m),
      () => 0,
    );
    hosts.receive({ scope: 'a', msg: load(1) });
    hosts.receive({
      scope: 'a',
      msg: { t: 'cards', cards: { items: [], types: [], statusNames: new Map() } },
    });
    while (hosts.work(8));
    const values = heard.filter((m) => m.out.t === 'values').at(-1);
    expect(values).toMatchObject({ scope: 'a', out: { cells: [[0, 0, 0]] } });
    hosts.receive({ scope: 'a', msg: { t: 'cards', cards: null } });
    hosts.receive({ scope: 'a', msg: { t: 'drop' } });
    heard.length = 0;
    expect(hosts.work(8)).toBe(false);
    expect(heard).toEqual([]);
  });

  // plan-links.md "The `CARD` functions": a spreadsheet whose cards cannot be read reads #REF! with why.
  it('reads cards that cannot be read as #REF! with why', () => {
    const heard: FromEngine[] = [];
    const hosts = new EngineHosts(
      (m) => heard.push(m),
      () => 0,
    );
    hosts.receive({ scope: 'a', msg: load(1) });
    hosts.receive({ scope: 'a', msg: { t: 'cards', cards: { unavailable: CARDS_UNSET } } });
    while (hosts.work(8));
    const values = heard.filter((m) => m.out.t === 'values').at(-1);
    expect(values).toMatchObject({
      scope: 'a',
      out: { cells: [[0, 0, { e: '#REF!', why: CARDS_UNSET }]] },
    });
  });
});

describe('the engine link', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers in place where the page has no Workers', () => {
    const link = engineLink();
    const heard: FromEngine[] = [];
    link.listen((m) => heard.push(m));
    link.send({ scope: 'a', msg: load(1) });
    expect(heard.some((m) => m.out.t === 'settled')).toBe(true);
    link.close();
    inPlaceLink().close();
  });

  it('starts a module Worker where there is one, and ends it', () => {
    const posted: unknown[] = [];
    const terminate = vi.fn();
    let onMessage: ((e: MessageEvent) => void) | undefined;
    vi.stubGlobal(
      'Worker',
      class {
        postMessage = (m: unknown) => posted.push(m);
        addEventListener = (_: string, fn: (e: MessageEvent) => void) => (onMessage = fn);
        terminate = terminate;
      },
    );
    const link = engineLink();
    const heard: FromEngine[] = [];
    link.listen((m) => heard.push(m));
    link.send({ scope: 'a', msg: { t: 'tick', rev: 1 } });
    expect(posted).toEqual([{ scope: 'a', msg: { t: 'tick', rev: 1 } }]);
    onMessage!({ data: { scope: 'a', out: { t: 'settled', rev: 1 } } } as MessageEvent);
    expect(heard).toEqual([{ scope: 'a', out: { t: 'settled', rev: 1 } }]);
    link.close();
    expect(terminate).toHaveBeenCalled();
    expect(typeof workerLink).toBe('function');
  });
});
