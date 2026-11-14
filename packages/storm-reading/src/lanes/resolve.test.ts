// docs/specs/021-event-storming/lane-plans.md "How an agent suggests one".
import type { Element } from '@livedoc/document';
import { describe, expect, it } from 'vitest';
import { board, note } from '../testing';
import { kitchen } from './kitchen.fixture';
import { resolveLaneLines } from './resolve';

const context = (id: string, notes: string[]): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: id,
  esContext: { notes },
});

const lanesOf = (result: ReturnType<typeof resolveLaneLines>) =>
  'lanes' in result ? result.lanes.map((lane) => [lane.name, ...lane.notes]) : result.refusal;

describe('resolving the lines of a lane plan', () => {
  it('takes the notes now on a lane, by the number the reading prints for it', () => {
    const result = resolveLaneLines(kitchen(), [
      { name: 'Doing', lanes: [1, 2] },
      { name: 'Done', lanes: [3, 4] },
    ]);
    expect(lanesOf(result)).toEqual([
      ['Doing', 'cook', 'take-order', 'waiter', 'plate-dish'],
      ['Done', 'order-taken', 'fire-ticket', 'dish-plated'],
    ]);
  });

  it('takes the notes of a kind', () => {
    const result = resolveLaneLines(kitchen(), [
      { name: 'People', kinds: ['actor'] },
      { name: 'Flow', kinds: ['command', 'domain-event', 'policy'] },
    ]);
    expect(lanesOf(result)).toEqual([
      ['People', 'cook', 'waiter'],
      ['Flow', 'take-order', 'order-taken', 'fire-ticket', 'plate-dish', 'dish-plated'],
    ]);
  });

  it('takes the notes of a candidate context, and notes by id', () => {
    const tab = board(
      ...kitchen().elements,
      context('orders', ['cook', 'take-order', 'order-taken']),
    );
    const result = resolveLaneLines(tab, [
      { name: 'Orders', contexts: ['orders'] },
      { name: 'Kitchen', notes: ['fire-ticket', 'waiter', 'plate-dish', 'dish-plated'] },
    ]);
    expect(lanesOf(result)).toEqual([
      ['Orders', 'cook', 'take-order', 'order-taken'],
      ['Kitchen', 'fire-ticket', 'waiter', 'plate-dish', 'dish-plated'],
    ]);
  });

  it('gives a note to the most specific line: by id, then context, then kind, then lane', () => {
    const tab = board(
      ...kitchen().elements,
      context('orders', ['cook', 'take-order', 'order-taken']),
    );
    const result = resolveLaneLines(tab, [
      { name: 'Rest', lanes: [1, 2, 3, 4] },
      { name: 'People', kinds: ['actor'] },
      { name: 'Orders', contexts: ['orders'] },
      { name: 'Pass', notes: ['order-taken'] },
    ]);
    expect(lanesOf(result)).toEqual([
      ['Rest', 'fire-ticket', 'plate-dish', 'dish-plated'],
      ['People', 'waiter'],
      ['Orders', 'cook', 'take-order'],
      ['Pass', 'order-taken'],
    ]);
  });

  it('gives a note two lines name alike to the first', () => {
    const result = resolveLaneLines(kitchen(), [
      { name: 'First', kinds: ['actor', 'command'] },
      { name: 'Second', kinds: ['command', 'domain-event', 'policy'] },
    ]);
    expect(lanesOf(result)).toEqual([
      ['First', 'cook', 'take-order', 'waiter', 'plate-dish'],
      ['Second', 'order-taken', 'fire-ticket', 'dish-plated'],
    ]);
  });

  it('leaves a locked note and a free-placed one out of what a kind or a lane takes', () => {
    const locked = note({ id: 'locked', kind: 'actor', col: 4, lane: 0, extra: { locked: true } });
    const free = { ...note({ id: 'free', kind: 'actor', col: 5, lane: 0 }), y: 11 };
    const result = resolveLaneLines(board(...kitchen().elements, locked, free), [
      { name: 'People', kinds: ['actor'], lanes: [1] },
      { name: 'Flow', lanes: [2, 3, 4] },
    ]);
    expect(lanesOf(result)).toEqual([
      ['People', 'cook', 'waiter'],
      ['Flow', 'take-order', 'order-taken', 'fire-ticket', 'plate-dish', 'dish-plated'],
    ]);
  });

  it.each([[1], [13]])('refuses %i lanes', (count) => {
    const lines = Array.from({ length: count }, (_, i) => ({ name: `Lane ${i}`, lanes: [1] }));
    expect(lanesOf(resolveLaneLines(kitchen(), lines))).toEqual({
      code: 'lanes_out_of_range',
      count,
    });
  });

  it('refuses a lane number the reading does not print', () => {
    const result = resolveLaneLines(kitchen(), [
      { name: 'Doing', lanes: [1, 2] },
      { name: 'Done', lanes: [3, 5] },
    ]);
    expect(lanesOf(result)).toEqual({ code: 'lane_not_found', line: 1, lane: 5, lanes: 4 });
  });

  it('refuses a line that names a note the plan cannot hold', () => {
    const locked = note({ id: 'locked', kind: 'actor', col: 4, lane: 0, extra: { locked: true } });
    const result = resolveLaneLines(board(...kitchen().elements, locked), [
      { name: 'People', kinds: ['actor'], notes: ['locked'] },
      { name: 'Flow', lanes: [2, 3, 4] },
    ]);
    expect(lanesOf(result)).toEqual({ code: 'lane_blocked', line: 0, note: 'locked' });
  });

  it('refuses a line that takes no note', () => {
    const result = resolveLaneLines(kitchen(), [
      { name: 'All', lanes: [1, 2, 3, 4] },
      { name: 'People', lanes: [1] },
      { name: 'Nothing' },
    ]);
    expect(lanesOf(result)).toEqual({ code: 'lane_empty', line: 1 });
  });

  it('refuses a plan that leaves notes on no lane, naming them along the timeline', () => {
    const result = resolveLaneLines(kitchen(), [
      { name: 'People', kinds: ['actor'] },
      { name: 'Asks', kinds: ['command'] },
    ]);
    expect(lanesOf(result)).toEqual({
      code: 'lanes_incomplete',
      notes: ['order-taken', 'fire-ticket', 'dish-plated'],
    });
  });
});
