// Making one writing read as another by the least change (docs/specs/034-text-documents/review.md "Editing modes",
// Viewing; "What a Viewer receives"): a text replaced only between the stretch both start with and the stretch both
// end with, a list of children kept where both hold the same, matched pairwise where they differ and the rest taken
// out or cloned in. An editor bound to the target sees only what changed, so what it shows, where it is scrolled and
// what is selected stay put. Pure Yjs.
import * as Y from 'yjs';
import { isObject } from './live-suggestion-marks';

/** A text run's formatting as the target keeps it: as it is, or redacted. */
export type TextAttributesMap = (
  attributes: Record<string, unknown> | undefined,
) => Record<string, unknown> | undefined;

type Container = Y.XmlFragment | Y.XmlElement;
type Unit = {
  insert: unknown;
  attributes: Record<string, unknown> | undefined;
  marks: string;
  key: string;
};
type Run = { insert: unknown; attributes: Record<string, unknown> | undefined };

const asItIs: TextAttributesMap = (attributes) => attributes;

/** A value as JSON with every object's keys sorted. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    isObject(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );

/** A text's content as units (a character, or an object in a line), its formatting mapped, comparable by key. */
export function textUnits(text: Y.XmlText | Y.Text, map: TextAttributesMap = asItIs): Unit[] {
  const units: Unit[] = [];
  for (const op of text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    const attributes = map(op.attributes);
    // Compared by content, whatever order the keys came in.
    const marks = attributes ? canonical(attributes) : '';
    if (typeof op.insert === 'string') {
      for (const char of op.insert)
        units.push({ insert: char, attributes, marks, key: `${char}\u0000${marks}` });
    } else {
      units.push({
        insert: op.insert,
        attributes,
        marks,
        key: `\u0001${JSON.stringify(op.insert)}\u0000${marks}`,
      });
    }
  }
  return units;
}

/** Units joined back into runs: characters side by side with the same formatting are one insert. */
export function unitRuns(units: readonly Unit[]): Run[] {
  const runs: (Run & { marks: string })[] = [];
  for (const unit of units) {
    const last = runs.at(-1);
    if (
      last &&
      typeof last.insert === 'string' &&
      typeof unit.insert === 'string' &&
      last.marks === unit.marks
    )
      last.insert += unit.insert;
    else runs.push({ insert: unit.insert, attributes: unit.attributes, marks: unit.marks });
  }
  return runs.map(({ insert, attributes }) => ({ insert, attributes }));
}

/** What makes `target` read as `source`: the stretch between their common start and end, replaced. */
export function syncText(
  source: Y.XmlText | Y.Text,
  target: Y.XmlText | Y.Text,
  map: TextAttributesMap = asItIs,
): void {
  const want = textUnits(source, map);
  const have = textUnits(target);
  let start = 0;
  while (start < want.length && start < have.length && want[start]!.key === have[start]!.key)
    start += 1;
  let end = 0;
  while (
    end < want.length - start &&
    end < have.length - start &&
    want[want.length - 1 - end]!.key === have[have.length - 1 - end]!.key
  )
    end += 1;
  const removed = have.length - start - end;
  const added = want.slice(start, want.length - end);
  if (removed === 0 && added.length === 0) return;
  const delta: { retain?: number; delete?: number; insert?: unknown; attributes?: object }[] = [];
  const lead = lengthOf(have.slice(0, start));
  const had = have.slice(start, have.length - end);
  // The same characters formatted otherwise are formatted in place: what anchors on them (a comment) holds.
  if (sameContent(had, added)) {
    if (lead > 0) delta.push({ retain: lead });
    delta.push(...formatting(had, added));
    target.applyDelta(delta, { sanitize: false });
    return;
  }
  if (lead > 0) delta.push({ retain: lead });
  if (removed > 0) delta.push({ delete: lengthOf(had) });
  // Each inserted unit carries its whole formatting, nulls for what it lacks, so nothing leaks in from beside it.
  let before = have[start - 1]?.attributes ?? {};
  for (const run of unitRuns(added)) {
    const attributes: Record<string, unknown> = {};
    for (const key of Object.keys(before)) attributes[key] = null;
    Object.assign(attributes, run.attributes ?? {});
    delta.push({ insert: run.insert, attributes });
    before = run.attributes ?? {};
  }
  target.applyDelta(delta, { sanitize: false });
}

/** How long units are in the text's own measure (UTF-16 code units; an object is one). */
const lengthOf = (units: readonly Unit[]): number =>
  units.reduce((sum, u) => sum + (typeof u.insert === 'string' ? u.insert.length : 1), 0);

/** Whether two stretches hold the same characters and objects, whatever their formatting. */
const sameContent = (a: readonly Unit[], b: readonly Unit[]): boolean =>
  a.length === b.length &&
  a.every((u, i) =>
    typeof u.insert === 'string'
      ? u.insert === b[i]!.insert
      : canonical(u.insert) === canonical(b[i]!.insert),
  );

/** The retains that format `had` as `want`, unit for unit: a unit already formatted so is only retained. */
function formatting(
  had: readonly Unit[],
  want: readonly Unit[],
): { retain: number; attributes?: object }[] {
  const out: { retain: number; attributes?: Record<string, unknown>; key: string }[] = [];
  had.forEach((unit, i) => {
    const wanted = want[i]!;
    let attributes: Record<string, unknown> | undefined;
    if (unit.marks !== wanted.marks) {
      attributes = {};
      for (const key of Object.keys(unit.attributes ?? {})) attributes[key] = null;
      Object.assign(attributes, wanted.attributes ?? {});
    }
    const key = attributes ? canonical(attributes) : '';
    const length = typeof unit.insert === 'string' ? unit.insert.length : 1;
    const last = out.at(-1);
    if (last && last.key === key) last.retain += length;
    else out.push({ retain: length, ...(attributes ? { attributes } : {}), key });
  });
  return out.map(({ key: _, ...op }) => op);
}

type Node = Y.XmlElement | Y.XmlText;
const nodesOf = (container: Container): Node[] =>
  container.toArray().filter((c): c is Node => c instanceof Y.XmlElement || c instanceof Y.XmlText);

/** A node's whole content as one comparable string, read once per sync. */
function keyOf(node: Node, keys: WeakMap<Node, string>): string {
  const known = keys.get(node);
  if (known !== undefined) return known;
  const key =
    node instanceof Y.XmlText
      ? `t${canonical(node.toDelta())}`
      : `e${node.nodeName}${canonical(node.getAttributes())}[${nodesOf(node)
          .map((c) => keyOf(c, keys))
          .join(',')}]`;
  keys.set(node, key);
  return key;
}

function syncAttributes(source: Y.XmlElement, target: Y.XmlElement): void {
  const want: Record<string, unknown> = source.getAttributes();
  const have: Record<string, unknown> = target.getAttributes();
  for (const [name, value] of Object.entries(want))
    if (!(name in have) || canonical(value) !== canonical(have[name]))
      target.setAttribute(name, value as never);
  for (const name of Object.keys(have)) if (!(name in want)) target.removeAttribute(name);
}

/** One node made to read as another of its kind: two texts, or two elements of one name. */
function syncNode(source: Node, target: Node, keys: WeakMap<Node, string>): void {
  if (source instanceof Y.XmlText && target instanceof Y.XmlText) {
    syncText(source, target);
    return;
  }
  syncAttributes(source as Y.XmlElement, target as Y.XmlElement);
  syncChildren(source as Y.XmlElement, target as Y.XmlElement, keys);
}

function syncChildren(source: Container, target: Container, keys: WeakMap<Node, string>): void {
  const want = nodesOf(source);
  const have = nodesOf(target);
  const same = (a: Node, b: Node) => keyOf(a, keys) === keyOf(b, keys);
  let start = 0;
  while (start < want.length && start < have.length && same(want[start]!, have[start]!)) start += 1;
  let end = 0;
  while (
    end < want.length - start &&
    end < have.length - start &&
    same(want[want.length - 1 - end]!, have[have.length - 1 - end]!)
  )
    end += 1;
  // The differing middles, aligned by node name (a block the other side lacks is taken out or cloned in, the rest
  // made to read alike in place, so what anchors on them holds); past ALIGN_CELLS_MAX, matched pairwise from the start.
  const wanted = want.slice(start, want.length - end);
  const had = have.slice(start, have.length - end);
  let index = start;
  for (const step of alignment(wanted, had, keys)) {
    if (step.kind === 'same') {
      syncNode(step.want, step.have, keys);
      index += 1;
    } else if (step.kind === 'out') target.delete(index, 1);
    else {
      target.insert(index, [step.want.clone()]);
      index += 1;
    }
  }
}

/** The most cells the alignment of two differing middles may weigh: past it, they are matched pairwise. */
export const ALIGN_CELLS_MAX = 4_000_000;

type Step =
  | { kind: 'same'; want: Node; have: Node }
  | { kind: 'out'; have: Node }
  | { kind: 'in'; want: Node };

const nameOf = (node: Node) => (node instanceof Y.XmlText ? '#text' : node.nodeName);

/** Steps that turn `had` into `wanted`: the longest run of nodes alike by name kept, preferring equal content. */
function alignment(
  wanted: readonly Node[],
  had: readonly Node[],
  keys: WeakMap<Node, string>,
): Step[] {
  const n = wanted.length;
  const m = had.length;
  if (n * m > ALIGN_CELLS_MAX) return pairwise(wanted, had);
  // weight[i][j]: the best score aligning wanted[i..] with had[j..]; a pair alike by name scores 2, by content 3.
  const width = m + 1;
  const weight = new Uint32Array((n + 1) * width);
  const score = (i: number, j: number) =>
    nameOf(wanted[i]!) !== nameOf(had[j]!)
      ? 0
      : keyOf(wanted[i]!, keys) === keyOf(had[j]!, keys)
        ? 3
        : 2;
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1) {
      const pair = score(i, j);
      weight[i * width + j] = Math.max(
        pair > 0 ? pair + weight[(i + 1) * width + j + 1]! : 0,
        weight[(i + 1) * width + j]!,
        weight[i * width + j + 1]!,
      );
    }
  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const pair = i < n && j < m ? score(i, j) : 0;
    if (pair > 0 && weight[i * width + j] === pair + weight[(i + 1) * width + j + 1]!) {
      steps.push({ kind: 'same', want: wanted[i]!, have: had[j]! });
      i += 1;
      j += 1;
    } else if (j < m && (i === n || weight[i * width + j] === weight[i * width + j + 1]!)) {
      steps.push({ kind: 'out', have: had[j]! });
      j += 1;
    } else {
      steps.push({ kind: 'in', want: wanted[i]! });
      i += 1;
    }
  }
  return steps;
}

/** The middles matched pairwise from their start while their names agree; the rest taken out, then cloned in. */
function pairwise(wanted: readonly Node[], had: readonly Node[]): Step[] {
  let pairs = 0;
  while (
    pairs < wanted.length &&
    pairs < had.length &&
    nameOf(wanted[pairs]!) === nameOf(had[pairs]!)
  )
    pairs += 1;
  return [
    ...wanted.slice(0, pairs).map((want, k): Step => ({ kind: 'same', want, have: had[k]! })),
    ...had.slice(pairs).map((have): Step => ({ kind: 'out', have })),
    ...wanted.slice(pairs).map((want): Step => ({ kind: 'in', want })),
  ];
}

/** Makes `target` read as `source` by the least change, in the caller's transaction. */
export function syncWriting(source: Container, target: Container): void {
  syncChildren(source, target, new WeakMap());
}
