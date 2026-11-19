import { describe, expect, it } from 'vitest';
import {
  SHAPE_KINDS,
  isChartShape,
  isCollabPanelShape,
  isConceptShape,
  FINISHES,
  isEntity,
  isEventStormingTab,
  isHandDrawn,
  isOfficeShape,
  isSeatingShape,
  ES_BIG_PICTURE_LAYER_ID,
  ES_BOARD_LAYER_ID,
  ES_DESIGN_LAYER_ID,
  ES_PROCESS_LAYER_ID,
  isSankeyShape,
  isWebComponentShape,
  type Element,
  type ShapeKind,
} from '@livedoc/document';
import { KIND_FAMILY_IDS } from './families';
import {
  kindFamiliesOf,
  kindFamiliesOfTab,
  kindFamilyOf,
  kindFamilyOfShape,
  finishFamilyOf,
} from './kind-family-of';

const shape = (kind: string, extra: object = {}) =>
  ({
    id: kind,
    type: 'shape',
    shape: kind,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...extra,
  }) as Element;
const of = (value: object) => value as Element;

// The faces each family holds, as the face router chooses them (ElementFaceRouter.tsx).
const SESSION_CONTROLS = [
  'mode-button',
  'focus-button',
  'session-button',
  'reveal',
  'picker',
  'reaction-pad',
  'portal',
  'tab-window',
];

describe('kindFamilyOfShape', () => {
  it.each([...SHAPE_KINDS])('places %s as the model’s predicates do', (kind) => {
    const k = kind as ShapeKind;
    const expected = SESSION_CONTROLS.includes(kind)
      ? 'session-controls'
      : isCollabPanelShape(k) || kind === 'comment-pin' || kind === 'action-card'
        ? 'collab-panels'
        : kind === 'page'
          ? 'pages-articles'
          : isConceptShape(k)
            ? 'concepts'
            : isEntity(shape(kind))
              ? 'entities'
              : isWebComponentShape(k)
                ? 'web-components'
                : isOfficeShape(k) || isSeatingShape(k)
                  ? 'office-seating'
                  : kind === 'mind-node'
                    ? 'mind-maps'
                    : isChartShape(k) || isSankeyShape(k)
                      ? 'charts'
                      : null;
    expect(kindFamilyOfShape(kind)).toBe(expected);
  });

  it('answers base for a kind it does not know, inherited names included', () => {
    expect(kindFamilyOfShape('hologram')).toBeNull();
    expect(kindFamilyOfShape('toString')).toBeNull();
  });

  it('names only registered families', () => {
    for (const kind of SHAPE_KINDS) {
      const family = kindFamilyOfShape(kind);
      if (family) expect(KIND_FAMILY_IDS).toContain(family);
    }
  });
});

describe('kindFamilyOf', () => {
  it.each([
    [of({ type: 'annotation', articleNote: 'comment' }), 'pages-articles'],
    [of({ type: 'annotation' }), null],
    [of({ type: 'image', heroCaption: { title: 'Hi' } }), 'web-components'],
    [of({ type: 'image' }), null],
    [of({ type: 'video' }), 'embeds'],
    [of({ type: 'link-card' }), 'embeds'],
    [of({ type: 'text' }), null],
    [of({ type: 'arrow' }), null],
    [of({ type: 'hologram' }), null],
    [shape('reveal'), 'session-controls'],
    [shape('square'), null],
  ])('places %j in %s', (element, family) => {
    expect(kindFamilyOf(element)).toBe(family);
  });
});

describe('kindFamiliesOf', () => {
  it('names each family once, in the order first met', () => {
    const elements = [
      shape('square'),
      shape('estimate'),
      of({ type: 'video' }),
      shape('agenda'),
      shape('reveal'),
    ];
    expect(kindFamiliesOf(elements)).toEqual(['collab-panels', 'embeds', 'session-controls']);
  });

  it('names none for a board of base kinds', () => {
    expect(kindFamiliesOf([shape('square'), of({ type: 'text' })])).toEqual([]);
    expect(kindFamiliesOf([])).toEqual([]);
  });
});

describe('kindFamiliesOfTab', () => {
  it('adds the pages family for a tab whose articles hold writing, after its elements’', () => {
    expect(
      kindFamiliesOfTab({ elements: [of({ type: 'video' })], articles: { a1: { blocks: [] } } }),
    ).toEqual(['embeds', 'pages-articles']);
  });

  it('names the pages family once when a page element holds it too', () => {
    expect(
      kindFamiliesOfTab({ elements: [shape('page')], articles: { a1: { blocks: [] } } }),
    ).toEqual(['pages-articles']);
  });

  it.each([undefined, null, {}, [], 'article'])('reads articles %j as none', (articles) => {
    expect(kindFamiliesOfTab({ elements: [], articles })).toEqual([]);
  });

  it('reads a tab with no element list as holding none', () => {
    expect(kindFamiliesOfTab({ elements: 'x' })).toEqual([]);
  });

  it('adds the Event Storming family for a board of that kind', () => {
    expect(kindFamiliesOfTab({ elements: [], kind: 'event-storming' })).toEqual(['event-storming']);
    expect(kindFamiliesOfTab({ elements: [], kind: 'diagram' })).toEqual([]);
  });

  it.each([ES_BOARD_LAYER_ID, ES_BIG_PICTURE_LAYER_ID, ES_PROCESS_LAYER_ID, ES_DESIGN_LAYER_ID])(
    'knows a board from before tabs had a kind by its %s layer, as the model does',
    (id) => {
      const tab = { elements: [], layers: [{ id, name: 'Board', visible: true, locked: false }] };
      expect(isEventStormingTab(tab as never)).toBe(true);
      expect(kindFamiliesOfTab(tab)).toEqual(['event-storming']);
    },
  );

  it.each([undefined, 'x', [null], [{ id: 'layer:other' }]])(
    'reads layers %j as no board',
    (layers) => {
      expect(kindFamiliesOfTab({ elements: [], layers })).toEqual([]);
    },
  );
});

describe('finishFamilyOf', () => {
  it.each([...FINISHES])('places the %s finish as the model draws it by hand', (finish) => {
    expect(finishFamilyOf(finish)).toBe(isHandDrawn(finish) ? 'sketches' : null);
  });

  it.each([undefined, null, 'chalk', 3])('reads %j as no finish of a family', (finish) => {
    expect(finishFamilyOf(finish)).toBeNull();
  });

  it('adds the sketches family for a board in a hand-drawn finish, after its elements’', () => {
    expect(kindFamiliesOfTab({ elements: [shape('pyramid')], finish: 'marker' })).toEqual([
      'concepts',
      'sketches',
    ]);
    expect(kindFamiliesOfTab({ elements: [], finish: 'professional' })).toEqual([]);
  });

  it('adds the sketches family for an element drawn in a hand-drawn finish of its own', () => {
    expect(kindFamiliesOf([shape('square', { finish: 'sketch' }), shape('pyramid')])).toEqual([
      'sketches',
      'concepts',
    ]);
    expect(
      kindFamiliesOfTab({ elements: [shape('square', { finish: 'sketch' })], finish: 'sketch' }),
    ).toEqual(['sketches']);
  });
});
