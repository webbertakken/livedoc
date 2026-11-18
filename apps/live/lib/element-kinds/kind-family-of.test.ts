import { describe, expect, it } from 'vitest';
import {
  SHAPE_KINDS,
  isCollabPanelShape,
  isConceptShape,
  isWebComponentShape,
  type Element,
  type ShapeKind,
} from '@livedoc/document';
import { KIND_FAMILY_IDS } from './families';
import { kindFamiliesOf, kindFamilyOf, kindFamilyOfShape } from './kind-family-of';

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
            : isWebComponentShape(k)
              ? 'web-components'
              : kind === 'mind-node'
                ? 'mind-maps'
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
