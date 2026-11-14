// docs/specs/021-event-storming/lane-plans.md "The plan".
import { describe, expect, it } from 'vitest';
import { ES_LANES, laneCentre } from './event-storming-lanes';
import {
  LANE_PLAN_NOTES_MAX,
  LANES_MAX,
  LANES_MIN,
  isLanePlan,
  isValidEsLanePlan,
  newLanePlanElement,
  openLanePlan,
  plannableNotes,
  withLanePlan,
  withoutLanePlans,
  type EsLanePlan,
} from './event-storming-lane-plan';
import { kindWordOf } from './element-refs';
import type { Element, Layer, StickyElement } from './index';
import { boardElements, hiddenLayerElementIds } from './layers';
import { openSuggestionCount } from './open-suggestions';
import { elementValidationIssue, isValidElement } from './validate';

const note = (
  id: string,
  lane: number,
  x = 0,
  extra: Partial<StickyElement> = {},
): StickyElement => ({
  id,
  type: 'sticky',
  x,
  y: laneCentre(lane, ES_LANES) - 100,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
  ...extra,
});

const plan: EsLanePlan = {
  lanes: [
    { name: 'Customer', notes: ['a', 'b'] },
    { name: 'Kitchen', notes: ['c'] },
  ],
  reason: 'Two parts of the business',
  by: 'Claude',
};

const notes = [note('a', 0), note('b', 1, 216), note('c', 3, 432)];
const planElement = (id = 'plan-1', held = plan) => newLanePlanElement({ id, plan: held, notes });

describe('a lane plan (lane-plans.md "The plan")', () => {
  it('bounds a board to between two and twelve lanes', () => {
    expect([LANES_MIN, LANES_MAX]).toEqual([2, 12]);
  });

  it('accepts lanes with a name and notes, a reason and who', () => {
    expect(isValidEsLanePlan(plan)).toBe(true);
    expect(isValidEsLanePlan({ lanes: plan.lanes })).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['no lanes', { lanes: 'none' }],
    ['one lane', { lanes: [plan.lanes[0]] }],
    [
      'thirteen lanes',
      { lanes: Array.from({ length: 13 }, (_, i) => ({ name: 'L', notes: [`n${i}`] })) },
    ],
    ['a lane that is no object', { lanes: [plan.lanes[0], null] }],
    ['a blank name', { lanes: [plan.lanes[0], { name: ' ', notes: ['c'] }] }],
    ['a name that is no text', { lanes: [plan.lanes[0], { name: 4, notes: ['c'] }] }],
    ['a name past the limit', { lanes: [plan.lanes[0], { name: 'x'.repeat(41), notes: ['c'] }] }],
    ['a lane with no notes', { lanes: [plan.lanes[0], { name: 'Kitchen', notes: [] }] }],
    ['notes that are no list', { lanes: [plan.lanes[0], { name: 'Kitchen', notes: 'c' }] }],
    ['a note that is no id', { lanes: [plan.lanes[0], { name: 'Kitchen', notes: [''] }] }],
    ['a note on two lanes', { lanes: [plan.lanes[0], { name: 'Kitchen', notes: ['a'] }] }],
    [
      'more notes than a board holds',
      {
        lanes: [
          plan.lanes[0],
          {
            name: 'Kitchen',
            notes: Array.from({ length: LANE_PLAN_NOTES_MAX }, (_, i) => `n${i}`),
          },
        ],
      },
    ],
    ['a reason past the limit', { ...plan, reason: 'x'.repeat(201) }],
    ['a name for who past the limit', { ...plan, by: 'x'.repeat(61) }],
  ])('refuses %s', (_what, value) => {
    expect(isValidEsLanePlan(value)).toBe(false);
  });

  it('is a shape that carries the plan, boxed round its notes, on their layer', () => {
    const el = newLanePlanElement({
      id: 'plan-1',
      plan,
      notes: [note('a', 0, 0, { layerId: 'layer:es:board' })],
    });
    expect(el).toMatchObject({ id: 'plan-1', type: 'shape', shape: 'square', esLanePlan: plan });
    expect(el).toMatchObject({ x: 0, y: 0, width: 200, height: 200, layerId: 'layer:es:board' });
    expect(isLanePlan(el)).toBe(true);
    expect(isValidElement(el)).toBe(true);
    expect(planElement()).not.toHaveProperty('layerId');
  });

  it('is told apart from any other element', () => {
    expect(isLanePlan(notes[0]!)).toBe(false);
    expect(isLanePlan({ type: 'sticky', esLanePlan: plan })).toBe(false);
  });

  it('is refused by the validator when its plan is not one', () => {
    const broken = { ...planElement(), esLanePlan: { lanes: [] } };
    expect(elementValidationIssue(broken)).toMatchObject({ field: 'esLanePlan' });
  });

  it('is named for what it is, never for the shape that carries it', () => {
    expect(kindWordOf(planElement())).toBe('lane-plan');
  });

  it('is never painted, hit or exported as a shape', () => {
    const elements: Element[] = [...notes, planElement()];
    expect(boardElements(elements).map((el) => el.id)).toEqual(['a', 'b', 'c']);
    expect(hiddenLayerElementIds(elements, undefined)).toEqual(new Set(['plan-1']));
  });

  it('counts as one open suggestion', () => {
    expect(openSuggestionCount([...notes, planElement()])).toBe(1);
    expect(openSuggestionCount(notes)).toBe(0);
  });
});

describe('the open plan (lane-plans.md "One open plan a board")', () => {
  it('is the board’s plan, or none', () => {
    expect(openLanePlan(notes)).toBeNull();
    expect(openLanePlan([...notes, planElement()])?.id).toBe('plan-1');
  });

  it('reads a plan that is not valid as none', () => {
    const broken = { ...planElement(), esLanePlan: { lanes: [] } } as unknown as Element;
    expect(openLanePlan([...notes, broken])).toBeNull();
  });

  it('is replaced by a new plan', () => {
    const first = withLanePlan(notes, planElement('plan-1'));
    const second = withLanePlan(first, planElement('plan-2'));
    expect(second.map((el) => el.id)).toEqual(['a', 'b', 'c', 'plan-2']);
  });

  it('is removed, and a board without one is left as it is', () => {
    const held = [...notes, planElement()];
    expect(withoutLanePlans(held).map((el) => el.id)).toEqual(['a', 'b', 'c']);
    expect(withoutLanePlans(notes)).toBe(notes);
  });
});

describe('the notes a plan holds (lane-plans.md "Which notes it holds")', () => {
  const layers: Layer[] = [
    { id: 'open', name: 'Open' },
    { id: 'shut', name: 'Shut', locked: true },
    { id: 'unseen', name: 'Unseen', visible: false },
  ];

  it('holds every workshop note on a lane', () => {
    const elements: Element[] = [
      ...notes,
      { id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10 },
      { id: 'plain', type: 'sticky', x: 0, y: 0, width: 200, height: 200 },
    ];
    expect(plannableNotes({ elements }).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves a suggested note out', () => {
    const suggested = note('s', 0, 600, { esSuggestion: { anchorId: 'a', side: 'after' } });
    expect(plannableNotes({ elements: [...notes, suggested] }).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('leaves a locked note and a note on a locked layer where they are', () => {
    const elements = [
      note('a', 0, 0, { locked: true }),
      note('b', 1, 0, { layerId: 'shut' }),
      note('c', 2),
    ];
    expect(plannableNotes({ elements, layers }).map((n) => n.id)).toEqual(['c']);
  });

  it('leaves a note placed free of the lanes where it is', () => {
    const free = { ...note('f', 0), y: 37 };
    expect(plannableNotes({ elements: [free, ...notes] }).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('holds a note on a hidden layer as any other', () => {
    const elements = [note('a', 0, 0, { layerId: 'unseen' })];
    expect(plannableNotes({ elements, layers }).map((n) => n.id)).toEqual(['a']);
  });
});
