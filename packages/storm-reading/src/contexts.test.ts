import { describe, expect, it } from 'vitest';
import type { Element } from '@livedoc/document';
import { parsePreviousReading } from './bundle';
import { diffReadings, formatChanges, hasChanges } from './changes';
import { formatStormView } from './format';
import { readBoard } from './reading';
import { readSuggestions } from './suggestions';
import { board, type NoteSpec } from './testing';

// docs/specs/021-event-storming/candidate-contexts.md "In the reading and the export".

const context = (
  id: string,
  name: string,
  notes: string[],
  suggestion?: { reason?: string; by?: string },
): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  label: name,
  esContext: { notes, ...(suggestion ? { suggestion } : {}) },
});

const notes: NoteSpec[] = [
  { id: 'e1', kind: 'domain-event', col: 0, words: 'Member Joined' },
  { id: 'e2', kind: 'domain-event', col: 1, words: 'Invoice Sent' },
  { id: 'e3', kind: 'domain-event', col: 2, words: 'Invoice Paid' },
];

describe('the reading lists kept contexts', () => {
  it('names each with its notes in reading order, in timeline order of its first note', () => {
    const tab = board(
      ...notes,
      context('billing', ' Billing  ', ['e3', 'e2', 'e2', 'gone']),
      context('members', 'Members', ['e1']),
      context('empty', 'Empty', ['gone']),
      context('sugg', 'Suggested', ['e1'], { reason: 'r' }),
    );
    const reading = readBoard(tab);
    expect(reading.contexts).toEqual([
      { id: 'members', ref: expect.any(String), name: 'Members', notes: ['e1'] },
      { id: 'billing', ref: expect.any(String), name: 'Billing', notes: ['e2', 'e3'] },
    ]);
  });

  it('is empty for a board without contexts', () => {
    expect(readBoard(board(...notes)).contexts).toEqual([]);
  });
});

describe('suggested contexts are suggestions', () => {
  it('lists each with its notes, refs, who and why, an orphan when none of its notes is left', () => {
    const tab = board(
      ...notes,
      context('s1', 'Billing', ['e2', 'gone', 'e3'], { reason: 'money', by: 'Agent' }),
      context('s2', 'Lost', ['gone'], {}),
    );
    const [s1, s2] = readSuggestions(tab);
    expect(s1).toEqual({
      type: 'context',
      id: 's1',
      ref: expect.any(String),
      name: 'Billing',
      notes: ['e2', 'e3'],
      noteRefs: [expect.any(String), expect.any(String)],
      reason: 'money',
      by: 'Agent',
      orphan: false,
    });
    expect(s2).toMatchObject({ type: 'context', reason: null, by: null, orphan: true });
  });
});

describe('the storm view', () => {
  it('counts and prints the contexts, and prints a suggested one among the suggestions', () => {
    const tab = board(
      ...notes,
      context('k', 'Billing', ['e2', 'e3']),
      context('s', 'Members', ['e1'], { reason: 'who joins', by: 'Agent' }),
      context('s0', 'Plain', ['e1'], {}),
    );
    const reading = readBoard(tab);
    const lines = formatStormView(reading, readSuggestions(tab));
    const ref = (id: string) => reading.notes.find((n) => n.id === id)!.ref;
    expect(lines[0]).toContain('· 1 context · 2 suggestions');
    expect(lines).toContain('contexts');
    expect(lines).toContain(`  ${reading.contexts[0]!.ref} "Billing": ${ref('e2')},${ref('e3')}`);
    expect(
      lines.some((l) => l.endsWith(`context "Members" ${ref('e1')} · by Agent: who joins`)),
    ).toBe(true);
    expect(lines.some((l) => l.endsWith(`context "Plain" ${ref('e1')}`))).toBe(true);
  });
});

describe('CHANGES between readings', () => {
  const before = readBoard(
    board(
      ...notes,
      context('a', 'Billing', ['e2', 'e3']),
      context('b', 'Members', ['e1']),
      context('gone', 'Old', ['e1']),
    ),
  );
  const after = readBoard(
    board(
      ...notes,
      context('a', 'Payments', ['e2', 'e1']),
      context('b', 'Members', ['e1']),
      context('new', 'Fresh', ['e3']),
    ),
  );

  it('reports contexts added, removed and renamed, and notes that joined or left', () => {
    const c = diffReadings(before, after);
    expect(c.contextsAdded.map((x) => x.id)).toEqual(['new']);
    expect(c.contextsRemoved.map((x) => x.id)).toEqual(['gone']);
    expect(c.contextsRenamed).toEqual([
      { context: expect.objectContaining({ id: 'a' }), was: 'Billing' },
    ]);
    expect(c.joined).toEqual([{ note: 'e1', context: expect.objectContaining({ id: 'a' }) }]);
    expect(c.left).toEqual([{ note: 'e3', context: expect.objectContaining({ id: 'a' }) }]);
    expect(hasChanges(c)).toBe(true);

    const text = formatChanges(c, before, after);
    expect(text).toContain(
      '## Contexts added\n\n- context new "Fresh": domain-event e3 "Invoice Paid"',
    );
    expect(text).toContain('## Contexts removed\n\n- context gone "Old"');
    expect(text).toContain('## Contexts renamed\n\n- context a "Payments", was "Billing"');
    expect(text).toContain(
      '## Joined a context\n\n- domain-event e1 "Member Joined" joined context a "Payments"',
    );
    expect(text).toContain(
      '## Left a context\n\n- domain-event e3 "Invoice Paid" left context a "Payments"',
    );
  });

  it('reads an earlier export from before contexts as having none', () => {
    const { contexts: _none, ...older } = before;
    const previous = parsePreviousReading(JSON.stringify(older))!;
    expect(previous.contexts).toEqual([]);
    expect(diffReadings(previous, after).contextsAdded).toHaveLength(3);
  });
});
