import {
  buildMindTemplate,
  createText,
  MIND_HUES,
  type MindHue,
  type MindSpec,
  type Element,
  type ShapeElement,
} from '@livedoc/document';

// The mind-map templates (docs/specs/009-elements/mind-node.md "Templates"). Every one is built from
// MIND NODES carrying their parent pointers and the root's flow, and laid out
// by the same `layoutMindTree` that keyboard growth uses, so a template is a
// live, tidy map rather than a picture of one: select any node, and Tab and
// Enter grow it in place, with the new nodes matching the template's own.
// Squares and circles looked identical and did nothing.

// The builder lives with the mind-node layout in the document package; templates import it from here as before.
export { buildMindTemplate, type MindSpec };

// Every map here is a quick start, never a finished map (docs/specs/009-elements/mind-node.md "Templates"): a few
// one-word ideas to grow from, so whoever opens one starts typing their own rather than reading ours. The levels still
// read apart at a glance: a bold root, branches each in their OWN hue (card tint, border and the connector into them),
// and white leaves edged in their branch's hue. Growth copies the look of a node at the same level and its siblings'
// connector, so what is grown comes out in the map's own colours.

// The root every quick start shares: the strongest preset, the largest text, a circle in the radial maps.
const rootLook = (round: boolean): MindSpec['look'] => ({
  width: 200,
  height: round ? 200 : 96,
  textSize: 'lg',
  colorPreset: 'bold',
  ...(round ? { borderRadius: 'full' } : {}),
});

// A first-level branch in its hue: tinted, bold medium text, a thick border and connector.
const branch = (label: string, hue: MindHue, children?: MindSpec[]): MindSpec => ({
  label,
  look: {
    width: 150,
    height: 56,
    textSize: 'md',
    textBold: true,
    fillColor: hue.fill,
    strokeColor: hue.stroke,
    textColor: hue.text,
    strokeWidth: 'thick',
  },
  connector: { strokeColor: hue.stroke, strokeWidth: 4 },
  ...(children ? { children } : {}),
});

// A leaf: a plain white card edged in its branch's hue.
const leaf = (label: string, hue: MindHue): MindSpec => ({
  label,
  look: {
    width: 180,
    height: 44,
    textSize: 'sm',
    fillColor: '#ffffff',
    strokeColor: hue.leaf,
    textColor: '#334155',
  },
  connector: { strokeColor: hue.leaf, strokeWidth: 2 },
});

const HOW_TO = 'Select any idea, then press Tab to add a child or Enter to add a sibling.';

// Blank Brainstorm: the central idea alone, in the radial (bubble) flow, so its first Tab starts the ring. No how-to
// line: the root is the tab's only element, which is what selects it on landing (mind-node.md "A lone root opens
// selected"), and its toolbar names the two keys.
export const BRAINSTORM_CENTRAL_IDEA = 'Central idea';

export function buildBlankBrainstorm(cx: number, cy: number): Element[] {
  return buildMindTemplate(
    { label: BRAINSTORM_CENTRAL_IDEA, look: rootLook(true) },
    'bubble',
    cx,
    cy,
  );
}

// Radial mind map: a weekend trip, four question-word branches round it.
const TRIP_BRANCHES = ['Where', 'When', 'Who', 'Budget'];

export function buildMindMap(cx: number, cy: number): Element[] {
  const map = buildMindTemplate(
    {
      label: 'Weekend trip',
      look: rootLook(true),
      children: TRIP_BRANCHES.map((label, i) => branch(label, MIND_HUES[i % MIND_HUES.length]!)),
    },
    'bubble',
    cx,
    cy,
  );
  return [...map, mindHowTo(map, HOW_TO)];
}

// The muted how-to line under a map: the two keys that grow it, which a
// newcomer would otherwise only find in a hover card.
export function mindHowTo(map: Element[], label: string): Element {
  const nodes = map.filter((el): el is ShapeElement => el.type === 'shape');
  const left = Math.min(...nodes.map((n) => n.x));
  const right = Math.max(...nodes.map((n) => n.x + n.width));
  const bottom = Math.max(...nodes.map((n) => n.y + n.height));
  return {
    ...createText(left, bottom + 36),
    width: right - left,
    height: 28,
    label,
    textSize: 'sm',
    textColor: '#64748b',
    textAlignX: 'center',
  };
}

// Tree mind map: the same quick start as a left-to-right outline (the tree flow), for people who think in outlines.
// One leaf per branch shows the third level without filling it in.
const PROJECT_BRANCHES: [string, string][] = [
  ['Goals', 'Launch by June'],
  ['Tasks', 'Write the brief'],
  ['Questions', 'Who is it for?'],
];

export function buildMindMapTree(cx: number, cy: number): Element[] {
  const map = buildMindTemplate(
    {
      label: 'New project',
      look: rootLook(false),
      children: PROJECT_BRANCHES.map(([label, idea], i) => {
        const hue = MIND_HUES[(i + 1) % MIND_HUES.length]!;
        return branch(label, hue, [leaf(idea, hue)]);
      }),
    },
    'tree',
    cx,
    cy,
  );
  return [...map, mindHowTo(map, HOW_TO)];
}

// Bubble map: the Thinking Maps "describe it" map, one topic ringed by the words that describe it, each bubble a
// round mind node in its own hue (the branch palette plus teal) in the bubble flow, so Tab on the centre still adds
// another bubble to the ring.
const TEAM_WORDS = ['Curious', 'Kind', 'Bold', 'Calm', 'Clear'];
const TEAL: MindHue = { fill: '#ccfbf1', stroke: '#14b8a6', text: '#115e59', leaf: '#5eead4' };

export function buildBubbleMap(cx: number, cy: number): Element[] {
  const hues = [...MIND_HUES, TEAL];
  const map = buildMindTemplate(
    {
      label: 'Our team',
      look: rootLook(true),
      children: TEAM_WORDS.map((word, i) => {
        const hue = hues[i % hues.length]!;
        return {
          label: word,
          look: {
            width: 130,
            height: 130,
            textSize: 'md',
            textBold: true,
            borderRadius: 'full',
            fillColor: hue.fill,
            strokeColor: hue.stroke,
            textColor: hue.text,
            strokeWidth: 'thick',
          },
          connector: { strokeColor: hue.stroke, strokeWidth: 3 },
        };
      }),
    },
    'bubble',
    cx,
    cy,
  );
  return [...map, mindHowTo(map, 'One word per bubble. Tab on the centre adds another.')];
}
