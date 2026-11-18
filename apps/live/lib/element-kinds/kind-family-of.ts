import type { Element, ShapeKind } from '@livedoc/document';
import type { KindFamilyId } from './families';

// Which family an element belongs to (docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it"),
// or null for the base kinds that always load. Plain lists rather than the model's predicates, so the early reads
// can ask without the model's code; kind-family-of.test.ts holds them to the predicates.

const SHAPE_FAMILIES: Partial<Record<ShapeKind, KindFamilyId>> = {
  'mode-button': 'session-controls',
  'focus-button': 'session-controls',
  'session-button': 'session-controls',
  reveal: 'session-controls',
  picker: 'session-controls',
  'reaction-pad': 'session-controls',
  portal: 'session-controls',
  'tab-window': 'session-controls',
  'done-check': 'collab-panels',
  estimate: 'collab-panels',
  temperature: 'collab-panels',
  'idea-box': 'collab-panels',
  'qa-board': 'collab-panels',
  agenda: 'collab-panels',
  'roll-call': 'collab-panels',
  decision: 'collab-panels',
  quiz: 'collab-panels',
  'comment-pin': 'collab-panels',
  'action-card': 'collab-panels',
  page: 'pages-articles',
  'layer-stack': 'concepts',
  pyramid: 'concepts',
  cycle: 'concepts',
  hub: 'concepts',
  onion: 'concepts',
  chevrons: 'concepts',
  'timeline-rail': 'concepts',
  banner: 'web-components',
  callout: 'web-components',
  card: 'web-components',
  'stat-row': 'web-components',
  process: 'web-components',
  'site-header': 'web-components',
  'mind-node': 'mind-maps',
};

export function kindFamilyOfShape(kind: string): KindFamilyId | null {
  return Object.hasOwn(SHAPE_FAMILIES, kind) ? SHAPE_FAMILIES[kind as ShapeKind]! : null;
}

// Any value shaped like an element: a tab read straight off the wire is not checked yet, and an unknown type or
// shape (a newer api's) is base, drawn as it is today.
export function kindFamilyOf(element: Element): KindFamilyId | null {
  switch (element.type) {
    case 'shape':
      return kindFamilyOfShape(element.shape);
    case 'annotation':
      return element.articleNote ? 'pages-articles' : null;
    case 'image':
      return element.heroCaption ? 'web-components' : null;
    case 'video':
    case 'link-card':
      return 'embeds';
    default:
      return null;
  }
}

// The families a set of elements needs, each once, in the order first met.
export function kindFamiliesOf(elements: readonly Element[]): KindFamilyId[] {
  const families = new Set<KindFamilyId>();
  for (const element of elements) {
    const family = kindFamilyOf(element);
    if (family) families.add(family);
  }
  return [...families];
}
