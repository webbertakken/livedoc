import { describe, expect, it } from 'vitest';
import { ES_LANES, laneCentre, type Element, type Tab } from '@livedoc/document';
import { formatOperation } from '../format-operation';
import { formatResultLines } from '../format-results';
import { parseEditOperations } from '../parse';
import { applied, refused } from '../fixtures/outcomes';
import { run } from '../fixtures/run';
import { checkoutFlow } from '../fixtures/checkout-flow';

// docs/specs/021-event-storming/candidate-contexts.md "How an agent suggests one".

const y = laneCentre(0, ES_LANES) - 100;
const event = (id: string, x: number, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x,
  y,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});
const box: Element = {
  id: 'box',
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 600,
  width: 100,
  height: 60,
};
const board = (...more: Element[]): Tab => ({
  id: 't',
  name: 'Board',
  kind: 'event-storming',
  elements: [event('joined', 0, { layerId: 'layer:es' }), event('paid', 300), box, ...more],
});
const elementOf = (tab: Tab, id: string) => tab.elements.find((el) => el.id === id)!;

describe('suggest-context: parsing', () => {
  it('reads the line form into the JSON form, and prints it back', () => {
    const parsed = parseEditOperations(
      'suggest-context "Member accounts" joined paid reason="who they are" id=accounts',
    );
    expect(parsed).toEqual({
      operations: [
        {
          op: 'suggest-context',
          name: 'Member accounts',
          notes: ['joined', 'paid'],
          reason: 'who they are',
          id: 'accounts',
        },
      ],
    });
    if (!('operations' in parsed)) throw new Error('parsed');
    expect(formatOperation(parsed.operations[0]!)).toBe(
      'suggest-context "Member accounts" joined paid reason="who they are" id=accounts',
    );
    expect(
      formatOperation({ op: 'suggest-context', name: 'Billing', notes: ['"Invoice Paid"'] }),
    ).toBe('suggest-context "Billing" "Invoice Paid"');
  });

  it.each([
    ['suggest-context', 'the name'],
    ['suggest-context reason=x a', 'the name'],
    ['suggest-context "x" a fill=red', 'reason= or id='],
    ['suggest-context "x" a fill=[1', 'a JSON value'],
  ])('refuses %s', (line, expected) => {
    const parsed = parseEditOperations(line);
    expect('errors' in parsed && parsed.errors[0]!.details.join(' ')).toContain(expected);
  });

  it('checks the JSON form', () => {
    const bad = parseEditOperations(
      JSON.stringify({ op: 'suggest-context', name: 'x', notes: 'a' }),
    );
    expect('errors' in bad && bad.errors[0]!.details[0]).toContain('member "notes"');
    const name = parseEditOperations(
      JSON.stringify({ op: 'suggest-context', name: 3, notes: ['a'] }),
    );
    expect('errors' in name && name.errors[0]!.details[0]).toContain('member "name"');
  });
});

describe('suggest-context: applying', () => {
  it('adds a suggested context round its notes and moves nothing', () => {
    const tab = board();
    const outcome = applied(
      run('suggest-context "Member  accounts " joined paid joined reason="who"', tab, {
        agentName: 'Claude',
      }),
    );
    const context = elementOf(outcome.tab, 'member-accounts');
    expect(context).toMatchObject({
      type: 'shape',
      label: 'Member accounts',
      layerId: 'layer:es',
      x: 0,
      y,
      width: 500,
      height: 200,
      esContext: { notes: ['joined', 'paid'], suggestion: { reason: 'who', by: 'Claude' } },
    });
    expect(elementOf(outcome.tab, 'joined')).toBe(tab.elements[0]);
    expect(outcome.createdIds).toEqual(['member-accounts']);
    expect(formatResultLines(outcome.results)[0]).toContain('context "Member accounts"');
  });

  it('records no reason or by when none was given', () => {
    const outcome = applied(run('suggest-context "Billing" paid id=billing', board()));
    expect(elementOf(outcome.tab, 'billing')).toMatchObject({
      esContext: { notes: ['paid'], suggestion: {} },
    });
  });

  it.each([
    ['suggest-context "x" joined', checkoutFlow(), 'not_event_storming'],
    ['suggest-context " " joined', board(), 'name_required'],
    [`suggest-context "${'n'.repeat(61)}" joined`, board(), 'name_too_long'],
    [`suggest-context "x" joined reason="${'r'.repeat(201)}"`, board(), 'reason_too_long'],
    ['suggest-context "x"', board(), 'notes_required'],
    ['suggest-context "x" box', board(), 'note_not_a_note'],
    ['suggest-context "x" nowhere', board(), 'target_not_found'],
    ['suggest-context "x" joined id=Bad!', board(), 'invalid_value'],
  ])('refuses %s', (line, tab, code) => {
    expect(refused(run(line, tab)).code).toBe(code);
  });

  it('refuses a note that already belongs to a context, kept or suggested', () => {
    expect(
      refused(run('suggest-context "A" joined\nsuggest-context "B" paid joined', board())).code,
    ).toBe('note_in_context');
    const kept: Element = {
      id: 'kept',
      type: 'shape',
      shape: 'square',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      label: 'Kept',
      esContext: { notes: ['paid'] },
    };
    const rejection = refused(run('suggest-context "B" paid', board(kept)));
    expect(rejection.code).toBe('note_in_context');
    expect(rejection.details[0]).toContain('kept');
  });

  it('refuses a suggested note as a member', () => {
    const tab = board();
    const outcome = applied(run('suggest command "Pay" before=paid id=pay', tab));
    expect(refused(run('suggest-context "x" pay', outcome.tab)).code).toBe('note_not_a_note');
  });

  it('refuses past the board limit, counting suggested notes and contexts alike', () => {
    const notes = Array.from({ length: 59 }, (_, i) => `suggest command "c${i}" before=paid`);
    const outcome = applied(run([...notes, 'suggest-context "A" joined'].join('\n'), board()));
    expect(refused(run('suggest-context "B" paid', outcome.tab)).code).toBe('too_many_suggestions');
    expect(refused(run('suggest command "one more" before=paid', outcome.tab)).code).toBe(
      'too_many_suggestions',
    );
  });

  it('refuses more notes than a context holds', () => {
    const many = Array.from({ length: 401 }, (_, i) => event(`n${i}`, 1000 + i * 300));
    const line = `suggest-context "Big" ${many.map((n) => n.id).join(' ')}`;
    expect(refused(run(line, board(...many))).code).toBe('invalid_value');
  });
});

describe('suggest-context: removal', () => {
  it('goes when the last of its notes goes, and stays while one is left', () => {
    const suggested = applied(run('suggest-context "Money" joined paid id=money', board()));
    const one = applied(run('rm paid', suggested.tab));
    expect(elementOf(one.tab, 'money')).toBeDefined();
    const both = applied(run('rm joined', one.tab));
    expect(both.tab.elements.map((el) => el.id)).toEqual(['box']);
    expect(formatResultLines(both.results)).toContain(
      '- money  context "Money" (emptied by joined)',
    );
  });

  it('is removed by rm itself, its notes staying', () => {
    const suggested = applied(run('suggest-context "Money" joined id=money', board()));
    const outcome = applied(run('rm money', suggested.tab));
    expect(outcome.tab.elements.map((el) => el.id)).toEqual(['joined', 'paid', 'box']);
  });
});
