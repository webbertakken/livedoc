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
  if (start > 0) delta.push({ retain: start });
  if (removed > 0) delta.push({ delete: removed });
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

/** One node made to read as another where both are texts or elements of one name; false where they cannot. */
function syncNode(source: Node, target: Node, keys: WeakMap<Node, string>): boolean {
  if (source instanceof Y.XmlText && target instanceof Y.XmlText) {
    syncText(source, target);
    return true;
  }
  if (
    source instanceof Y.XmlElement &&
    target instanceof Y.XmlElement &&
    source.nodeName === target.nodeName
  ) {
    syncAttributes(source, target);
    syncChildren(source, target, keys);
    return true;
  }
  return false;
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
  // The differing middles, matched pairwise from their start where they can be; the rest taken out or cloned in.
  const wanted = want.slice(start, want.length - end);
  const had = have.slice(start, have.length - end);
  let index = start;
  let pairs = 0;
  while (
    pairs < wanted.length &&
    pairs < had.length &&
    syncNode(wanted[pairs]!, had[pairs]!, keys)
  ) {
    pairs += 1;
    index += 1;
  }
  if (had.length > pairs) target.delete(index, had.length - pairs);
  if (wanted.length > pairs)
    target.insert(
      index,
      wanted.slice(pairs).map((n) => n.clone()),
    );
}

/** Makes `target` read as `source` by the least change, in the caller's transaction. */
export function syncWriting(source: Container, target: Container): void {
  syncChildren(source, target, new WeakMap());
}
