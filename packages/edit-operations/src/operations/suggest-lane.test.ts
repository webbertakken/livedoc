import { describe, expect, it } from 'vitest';
import {
  isLanePlan,
  openLanePlan,
  openSuggestionCount,
  SUGGESTIONS_MAX,
  type Tab,
} from '@livedoc/document';
import { formatOperation } from '../format-operation';
import { parseEditOperations } from '../parse';
import { checkoutFlow } from '../fixtures/checkout-flow';
import { kitchenBoard, laneNote, TWO_LANES } from '../fixtures/kitchen-board';
import { applied, lines, refused } from '../fixtures/outcomes';
import { run } from '../fixtures/run';
import { stormNote } from '../fixtures/storm-board';

// docs/specs/021-event-storming/lane-plans.md "How an agent suggests one" and "What must stay true".

const planOf = (tab: Tab) => openLanePlan(tab.elements)!.esLanePlan;

describe('suggest-lane: parsing', () => {
  it('reads the line form into the JSON form, and prints it back', () => {
    const line =
      'suggest-lane "Front of house" lanes=1,2 kind=actor,command context=orders,bar cook take-order reason="one team"';
    const parsed = parseEditOperations(line);
    expect(parsed).toEqual({
      operations: [
        {
          op: 'suggest-lane',
          name: 'Front of house',
          lanes: [1, 2],
          kinds: ['actor', 'command'],
          contexts: ['orders', 'bar'],
          notes: ['cook', 'take-order'],
          reason: 'one team',
        },
      ],
    });
    if (!('operations' in parsed)) throw new Error('parsed');
    expect(formatOperation(parsed.operations[0]!)).toBe(line);
    expect(formatOperation({ op: 'suggest-lane', name: 'Kitchen' })).toBe('suggest-lane "Kitchen"');
  });

  it.each([
    ['suggest-lane', 'the lane’s name'],
    ['suggest-lane lanes=1 "Kitchen"', 'the lane’s name'],
    ['suggest-lane "Kitchen" lanes=one', 'lanes=1,2'],
    ['suggest-lane "Kitchen" lanes=1,', 'lanes=1,2'],
    ['suggest-lane "Kitchen" id=k', 'lanes=, kind=, context= or reason='],
    ['suggest-lane "Kitchen" fill=[1', 'a JSON value'],
  ])('refuses %s', (line, expected) => {
    const parsed = parseEditOperations(line);
    expect('errors' in parsed && parsed.errors[0]!.details.join(' ')).toContain(expected);
  });

  it('checks the JSON form', () => {
    const issue = (raw: object) => {
      const parsed = parseEditOperations(JSON.stringify({ op: 'suggest-lane', ...raw }));
      return 'errors' in parsed && parsed.errors[0]!.details[0];
    };
    expect(issue({})).toContain('member "name"');
    expect(issue({ name: 'K', lanes: [1.5] })).toContain('an array of lane numbers');
    expect(issue({ name: 'K', lanes: '1' })).toContain('an array of lane numbers');
    expect(issue({ name: 'K', kinds: [4] })).toContain('an array of kinds');
    expect(issue({ name: 'K', contexts: 'orders' })).toContain('an array of context selectors');
    expect(issue({ name: 'K', notes: 'cook' })).toContain('an array of note selectors');
  });
});

describe('suggest-lane: applying', () => {
  it('makes one plan of the lines of a changeset, and moves nothing', () => {
    const tab = kitchenBoard();
    const outcome = applied(run(TWO_LANES, tab, { agentName: 'Claude' }));
    expect(planOf(outcome.tab)).toEqual({
      lanes: [
        { name: 'Orders', notes: ['cook', 'take-order', 'order-taken'] },
        { name: 'Kitchen', notes: ['fire-ticket', 'waiter', 'plate-dish', 'dish-plated'] },
      ],
      reason: 'Two parts of the business',
      by: 'Claude',
    });
    expect(outcome.tab.elements.slice(0, 8)).toEqual(tab.elements);
    expect(outcome.createdIds).toHaveLength(1);
    expect(lines(outcome)).toEqual([
      expect.stringMatching(/^\+ \S+ {2}lane-plan: 2 lanes, 7 notes; reads the same$/),
    ]);
  });

  it('says how many loose notes would find a partner', () => {
    // An actor four lanes from its command is loose; a lane under it, it issues the command.
    const tab: Tab = {
      ...kitchenBoard(),
      elements: [
        laneNote('pay', 'command', 1, 0),
        laneNote('paid', 'domain-event', 2, 0),
        laneNote('buyer', 'actor', 0, 4),
      ],
    };
    const outcome = applied(
      run('suggest-lane "Flow" kind=command,domain-event\nsuggest-lane "People" buyer', tab),
    );
    expect(lines(outcome)[0]).toContain('reads the same, 1 loose note finds a partner');
    expect(planOf(outcome.tab)).not.toHaveProperty('by');
    expect(planOf(outcome.tab)).not.toHaveProperty('reason');
  });

  it('takes the first reason given as the plan’s', () => {
    const outcome = applied(
      run(
        'suggest-lane "Orders" context=orders\nsuggest-lane "Kitchen" lanes=1,2,3,4 reason="later"\nsuggest-lane "People" waiter waiter reason="last"',
        kitchenBoard(),
      ),
    );
    expect(planOf(outcome.tab).reason).toBe('later');
    expect(planOf(outcome.tab).lanes.map((lane) => lane.name)).toEqual([
      'Orders',
      'Kitchen',
      'People',
    ]);
  });

  it('replaces the plan already open, counted as one suggestion', () => {
    const once = applied(run(TWO_LANES, kitchenBoard()));
    const twice = applied(
      run('suggest-lane "People" kind=actor\nsuggest-lane "Flow" lanes=2,3,4', once.tab),
    );
    expect(twice.tab.elements.filter(isLanePlan)).toHaveLength(1);
    expect(planOf(twice.tab).lanes[0]!.name).toBe('People');
    expect(openSuggestionCount(twice.tab.elements)).toBe(1);
    expect(lines(twice).some((line) => line.startsWith('- '))).toBe(true);
  });

  it('is for the board its changeset leaves', () => {
    const outcome = applied(run(`rm waiter\n${TWO_LANES}`, kitchenBoard()));
    expect(planOf(outcome.tab).lanes[1]!.notes).toEqual([
      'fire-ticket',
      'plate-dish',
      'dish-plated',
    ]);
  });

  it('is taken back with rm', () => {
    const once = applied(run(TWO_LANES, kitchenBoard()));
    const ref = lines(once)[0]!.split(/\s+/)[1]!;
    expect(openLanePlan(applied(run(`rm ${ref}`, once.tab)).tab.elements)).toBeNull();
  });

  const locked = laneNote('locked', 'hotspot', 2, 0, { locked: true });
  const free = { ...laneNote('free', 'hotspot', 9, 0), y: 37 };

  it.each([
    ['suggest-lane "x" a', checkoutFlow(), 'not_event_storming'],
    ['suggest-lane " " lanes=1', kitchenBoard(), 'name_required'],
    [`suggest-lane "${'n'.repeat(41)}" lanes=1`, kitchenBoard(), 'name_too_long'],
    [`suggest-lane "x" lanes=1 reason="${'r'.repeat(201)}"`, kitchenBoard(), 'reason_too_long'],
    ['suggest-lane "x" kind=actor,event', kitchenBoard(), 'invalid_kind'],
    ['suggest-lane "x" lanes=0', kitchenBoard(), 'lanes_out_of_range'],
    ['suggest-lane "x" lanes=1,2,3,4', kitchenBoard(), 'lanes_out_of_range'],
    ['suggest-lane "x" context=cook', kitchenBoard(), 'not_a_context'],
    ['suggest-lane "x" context=nowhere', kitchenBoard(), 'target_not_found'],
    ['suggest-lane "x" nowhere', kitchenBoard(), 'target_not_found'],
    ['suggest-lane "x" orders', kitchenBoard(), 'note_not_a_note'],
    ['suggest-lane "x" lanes=1,2\nsuggest-lane "y" lanes=3,9', kitchenBoard(), 'lane_not_found'],
    ['suggest-lane "x" lanes=1,2,3,4\nsuggest-lane "y"', kitchenBoard(), 'lane_empty'],
    [
      'suggest-lane "x" kind=actor\nsuggest-lane "y" kind=command',
      kitchenBoard(),
      'lanes_incomplete',
    ],
    [`${TWO_LANES}\nsuggest-lane "z" locked`, kitchenBoard([locked]), 'element_locked'],
    [`${TWO_LANES}\nsuggest-lane "z" free`, kitchenBoard([free]), 'lane_blocked'],
    [TWO_LANES, kitchenBoard([locked]), 'lane_blocked'],
    [
      'suggest-lane "Events" kind=domain-event\nsuggest-lane "People" kind=actor\nsuggest-lane "Rules" kind=policy\nsuggest-lane "Asks" kind=command',
      kitchenBoard(),
      'reading_changes',
    ],
  ])('refuses %s', (text, tab, code) => {
    expect(refused(run(text, tab)).code).toBe(code);
  });

  it('names the line a refusal is about, and what to do', () => {
    const empty = refused(run('suggest-lane "x" lanes=1,2,3,4\nsuggest-lane "y"', kitchenBoard()));
    expect(empty).toMatchObject({ operation: 2, details: ['the lane "y" takes no note'] });
    const missing = refused(
      run('suggest-lane "x" lanes=1,2\nsuggest-lane "y" lanes=3,9', kitchenBoard()),
    );
    expect(missing).toMatchObject({ operation: 2 });
    expect(missing.details[0]).toContain('no lane 9: the board has lanes 1 to 4');
    const count = refused(run('suggest-lane "x" lanes=1,2,3,4', kitchenBoard()));
    expect(count).toMatchObject({ operation: 1 });
    expect(count.details[0]).toContain('1 lane; a plan has 2 to 12');
  });

  it('names the notes a plan leaves on no lane, the first ten', () => {
    const many = Array.from({ length: 12 }, (_, i) => stormNote(`n${i}`, `N ${i}`, 3000 + i * 300));
    const rejection = refused(
      run('suggest-lane "x" kind=actor\nsuggest-lane "y" kind=command', kitchenBoard(many)),
    );
    expect(rejection.details[0]).toContain('15 notes are on no lane');
    expect(rejection.details[0]).toContain('order-taken, fire-ticket, dish-plated, n0, n1');
    expect(rejection.details[0]).toContain('and 5 more');
  });

  it('says why a note cannot be planned, and which note is in the way', () => {
    const freeRef = refused(run(`${TWO_LANES}\nsuggest-lane "z" free`, kitchenBoard([free])));
    expect(freeRef.details[0]).toContain('free is placed free of the lanes');
    const landed = refused(run(TWO_LANES, kitchenBoard([locked])));
    expect(landed).toMatchObject({ operation: 1 });
    expect(landed.details[0]).toContain('a note would land on locked');
  });

  it('names what a plan would change in what the board says, so an agent can change its plan', () => {
    const rejection = refused(
      run(
        'suggest-lane "Events" kind=domain-event\nsuggest-lane "People" kind=actor\nsuggest-lane "Rules" kind=policy\nsuggest-lane "Asks" kind=command',
        kitchenBoard(),
      ),
    );
    expect(rejection.operation).toBe(1);
    expect(rejection.details).toContain('take-order (command) would no longer cause order-taken');
    expect(rejection.hint).toContain('within two lanes');
  });

  it('names two events a plan would read in another order, and cuts a long list of changes', () => {
    // Two events of one moment, one above the other: a plan that swaps their lanes reads them the other way round.
    const stacked: Tab = {
      ...kitchenBoard(),
      elements: [laneNote('upper', 'domain-event', 0, 0), laneNote('lower', 'domain-event', 0, 1)],
    };
    const swapped = refused(run('suggest-lane "A" lower\nsuggest-lane "B" upper', stacked));
    expect(swapped.details).toEqual([
      'lower (domain-event) would read before upper, which it follows',
    ]);

    // Eight commands above their events; six of them end three lanes from theirs: six relations lost, five named.
    const pairs = Array.from({ length: 8 }, (_, i) => [
      laneNote(`ask${i}`, 'command', i * 2, 0),
      laneNote(`done${i}`, 'domain-event', i * 2, 1),
    ]).flat();
    const far = refused(
      run(
        'suggest-lane "Asks" kind=command\nsuggest-lane "Gap" ask7\nsuggest-lane "More" ask6\nsuggest-lane "Events" kind=domain-event',
        { ...kitchenBoard(), elements: pairs },
      ),
    );
    expect(far.code).toBe('reading_changes');
    expect(far.details).toHaveLength(6);
    expect(far.details.at(-1)).toBe('and 1 more');
  });

  it('words one note left on no lane, and several loose notes that find a partner', () => {
    const one = refused(run('suggest-lane "x" lanes=1,2,3\nsuggest-lane "y" cook', kitchenBoard()));
    expect(one.details[0]).toContain('1 note is on no lane: fire-ticket');
    const loose: Tab = {
      ...kitchenBoard(),
      elements: [
        laneNote('pay', 'command', 1, 0),
        laneNote('paid', 'domain-event', 2, 0),
        laneNote('buyer', 'actor', 0, 4),
        laneNote('prices', 'read-model', 0, 5),
      ],
    };
    const outcome = applied(
      run(
        'suggest-lane "Flow" kind=command,domain-event\nsuggest-lane "People" buyer\nsuggest-lane "Facts" prices',
        loose,
      ),
    );
    expect(lines(outcome)[0]).toContain('reads the same, 2 loose notes find a partner');
  });

  it('refuses a plan on a board that holds as many suggestions as it may', () => {
    const suggested = Array.from({ length: SUGGESTIONS_MAX }, (_, i) =>
      stormNote(`s${i}`, `S ${i}`, 0, { esSuggestion: { anchorId: 'cook', side: 'after' } }),
    );
    const rejection = refused(run(TWO_LANES, kitchenBoard(suggested)));
    expect(rejection.code).toBe('too_many_suggestions');
  });
});
