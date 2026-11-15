import { describe, expect, it } from 'vitest';
import {
  CONTEXT_NAMES_MAX,
  NAMED_CONTEXTS_MAX,
  type CandidateContextElement,
  type Element,
  type Tab,
} from '@livedoc/document';
import { formatOperation } from '../format-operation';
import { parseEditOperations } from '../parse';
import { checkoutFlow } from '../fixtures/checkout-flow';
import { applied, lines, refused } from '../fixtures/outcomes';
import { run } from '../fixtures/run';
import { inBoard, stormBoard, stormContext, stormNote } from '../fixtures/storm-board';

// docs/specs/021-event-storming/suggested-changes.md "Name suggestions".

const namesOn = (tab: Tab, id: string) => inBoard<CandidateContextElement>(tab, id).esContext.names;

describe('suggest-name: parsing', () => {
  it('reads the line form into the JSON form, and prints it back', () => {
    const parsed = parseEditOperations(
      'suggest-name "Order desk" ordering kitchen reason="one team"',
    );
    expect(parsed).toEqual({
      operations: [
        {
          op: 'suggest-name',
          name: 'Order desk',
          contexts: ['ordering', 'kitchen'],
          reason: 'one team',
        },
      ],
    });
    if (!('operations' in parsed)) throw new Error('parsed');
    expect(formatOperation(parsed.operations[0]!)).toBe(
      'suggest-name "Order desk" ordering kitchen reason="one team"',
    );
    expect(formatOperation({ op: 'suggest-name', name: 'Sales', contexts: ['"Order desk"'] })).toBe(
      'suggest-name "Sales" "Order desk"',
    );
  });

  it.each([
    ['suggest-name', 'the name'],
    ['suggest-name reason=x ordering', 'the name'],
    ['suggest-name "x" ordering id=sales', 'reason='],
    ['suggest-name "x" ordering fill=[1', 'a JSON value'],
  ])('refuses %s', (line, expected) => {
    const parsed = parseEditOperations(line);
    expect('errors' in parsed && parsed.errors[0]!.details.join(' ')).toContain(expected);
  });

  it('checks the JSON form', () => {
    const bad = parseEditOperations(
      JSON.stringify({ op: 'suggest-name', name: 'x', contexts: 'a' }),
    );
    expect('errors' in bad && bad.errors[0]!.details[0]).toContain('an array of context selectors');
    const missing = parseEditOperations(JSON.stringify({ op: 'suggest-name', name: 'x' }));
    expect('errors' in missing && missing.errors[0]!.details[0]).toContain('member "contexts"');
  });
});

describe('suggest-name: applying', () => {
  it('touches nothing of the context but its suggestions: no look is filled in', () => {
    const bare = (el: Element): Element => {
      if (el.id !== 'kitchen') return el;
      const { textSize: _size, ...rest } = el as Element & { textSize?: string };
      return rest;
    };
    const outcome = applied(run('suggest-name "Meal prep" kitchen', stormBoard(bare)));
    expect('textSize' in inBoard(outcome.tab, 'kitchen')).toBe(false);
    expect(lines(outcome)[0]).not.toContain('textSize');
  });

  it('keeps a name for one context on that context and renames nothing', () => {
    const tab = stormBoard();
    const outcome = applied(
      run('suggest-name " Meal   prep " kitchen reason="what cooks call it"', tab, {
        agentName: 'Claude',
      }),
    );
    expect(inBoard(outcome.tab, 'kitchen')).toMatchObject({
      label: 'Kitchen',
      esContext: {
        notes: ['cooked'],
        names: [{ name: 'Meal prep', reason: 'what cooks call it', by: 'Claude' }],
      },
    });
    expect(outcome.createdIds).toEqual([]);
    expect(lines(outcome)[0]).toContain('~ kitchen  suggested name "Meal prep"');
  });

  it('keeps a name for a merge on the context the merge would keep', () => {
    const outcome = applied(run('suggest-name "Shop" kitchen ordering kitchen', stormBoard()));
    expect(namesOn(outcome.tab, 'ordering')).toEqual([{ name: 'Shop', with: ['kitchen'] }]);
    expect(namesOn(outcome.tab, 'kitchen')).toBeUndefined();
    expect(lines(outcome)[0]).toContain('~ ordering  suggested name "Shop" with kitchen');
  });

  it('takes a suggested context as it takes a kept one', () => {
    const outcome = applied(run('suggest-name "Dispatch" delivery', stormBoard()));
    expect(inBoard(outcome.tab, 'delivery')).toMatchObject({
      esContext: { suggestion: { by: 'Ada' }, names: [{ name: 'Dispatch' }] },
    });
  });

  it.each([
    ['suggest-name "x" a', checkoutFlow(), 'not_event_storming'],
    ['suggest-name " " kitchen', stormBoard(), 'name_required'],
    [`suggest-name "${'n'.repeat(61)}" kitchen`, stormBoard(), 'name_too_long'],
    [`suggest-name "x" kitchen reason="${'r'.repeat(201)}"`, stormBoard(), 'reason_too_long'],
    ['suggest-name "x"', stormBoard(), 'contexts_required'],
    ['suggest-name "x" placed', stormBoard(), 'not_a_context'],
    ['suggest-name "x" box', stormBoard(), 'not_a_context'],
    ['suggest-name "x" nowhere', stormBoard(), 'target_not_found'],
    ['suggest-name "kitchen " kitchen', stormBoard(), 'duplicate_suggestion'],
  ])('refuses %s', (line, tab, code) => {
    expect(refused(run(line, tab)).code).toBe(code);
  });

  it('refuses a name already suggested for the same contexts, ignoring case', () => {
    const once = applied(run('suggest-name "Shop" ordering kitchen', stormBoard()));
    const twice = refused(run('suggest-name "SHOP" kitchen ordering', once.tab));
    expect(twice.code).toBe('duplicate_suggestion');
    expect(twice.details[0]).toContain('"SHOP" is already suggested for kitchen, ordering');
    // The same name for one of them alone is another suggestion.
    expect(
      namesOn(applied(run('suggest-name "Shop" ordering', once.tab)).tab, 'ordering'),
    ).toHaveLength(2);
  });

  it('refuses a context that holds as many names as it may', () => {
    const names = Array.from(
      { length: CONTEXT_NAMES_MAX },
      (_, i) => `suggest-name "Name ${i}" kitchen`,
    );
    const full = applied(run(names.join('\n'), stormBoard()));
    const rejection = refused(run('suggest-name "One more" kitchen', full.tab));
    expect(rejection.code).toBe('too_many_suggestions');
    expect(rejection.details[0]).toContain(`kitchen holds ${CONTEXT_NAMES_MAX} name suggestions`);
  });

  it('refuses past the board limit, a name counting as any suggestion does', () => {
    const notes = Array.from({ length: 58 }, (_, i) => `suggest command "c${i}" before=paid`);
    // 58 suggested notes and the suggested context Delivery: 59 open.
    const nearly = applied(run(notes.join('\n'), stormBoard()));
    const full = applied(run('suggest-name "Cooking" kitchen', nearly.tab));
    expect(refused(run('suggest-name "Prep" kitchen', full.tab)).code).toBe('too_many_suggestions');
    expect(refused(run('suggest command "one more" before=paid', full.tab)).code).toBe(
      'too_many_suggestions',
    );
  });

  it('refuses a name for more contexts than a merge takes', () => {
    const many = Array.from({ length: NAMED_CONTEXTS_MAX + 1 }, (_, i) => [
      stormNote(`n${i}`, `Note ${i}`, 2000 + i * 300),
      stormContext(`c${i}`, `Context ${i}`, { notes: [`n${i}`] }),
    ]).flat();
    const line = `suggest-name "All" ${many
      .filter((el) => el.type === 'shape')
      .map((el) => el.id)
      .join(' ')}`;
    expect(refused(run(line, stormBoard(undefined, many))).code).toBe('invalid_value');
  });

  it('refuses a name a person dismissed before, for the same contexts', () => {
    const declined: Tab = {
      ...stormBoard(),
      esDeclined: [{ type: 'name', words: 'Shop', about: ['kitchen', 'ordering'] }],
    };
    const rejection = refused(run('suggest-name "shop!" ordering kitchen', declined));
    expect(rejection.code).toBe('declined_before');
    expect(rejection.details[0]).toContain('the name "shop!" for ordering, kitchen');
    // For one of them alone it was never declined.
    expect(
      namesOn(applied(run('suggest-name "Shop" kitchen', declined)).tab, 'kitchen'),
    ).toHaveLength(1);
  });

  it('refuses a locked context', () => {
    const locked = stormBoard((el) => (el.id === 'kitchen' ? { ...el, locked: true } : el));
    expect(refused(run('suggest-name "Prep" kitchen', locked)).code).toBe('element_locked');
  });
});

describe('suggest-name: result lines', () => {
  it('says a context changed when more than its names did', () => {
    expect(
      lines(run('set kitchen esContext={"notes":["cooked","shipped"]}', stormBoard())),
    ).toEqual(['~ kitchen  esContext (changed)']);
  });

  it('says the names beside the change when a shape becomes a context holding some', () => {
    expect(
      lines(
        run(
          'set box label=Fulfilment esContext={"notes":["placed"],"names":[{"name":"Sales"}]}',
          stormBoard(),
        ),
      )[0],
    ).toContain('label →"Fulfilment" · suggested name "Sales" · esContext (changed)');
  });

  it('says the names taken back when a context stops being one', () => {
    const named = applied(run('suggest-name "Prep" kitchen', stormBoard()));
    expect(lines(run('set kitchen esContext=', named.tab))).toEqual([
      '~ kitchen  took back 1 name · esContext (changed)',
    ]);
  });
});

describe('suggest-name: going with its contexts', () => {
  it('goes when a context it names is removed', () => {
    const named = applied(
      run('suggest-name "Shop" ordering kitchen\nsuggest-name "Orders" ordering', stormBoard()),
    );
    const outcome = applied(run('rm kitchen', named.tab));
    expect(namesOn(outcome.tab, 'ordering')).toEqual([{ name: 'Orders' }]);
    expect(lines(outcome)).toEqual([
      '- kitchen  context "Kitchen"',
      '~ ordering  took back 1 name',
    ]);
  });

  it('goes when a context it names is emptied by its last note going', () => {
    const named = applied(run('suggest-name "Shop" ordering kitchen', stormBoard()));
    const outcome = applied(run('rm cooked', named.tab));
    expect(inBoard(outcome.tab, 'kitchen')).toBeUndefined();
    expect(namesOn(outcome.tab, 'ordering')).toBeUndefined();
  });
});
