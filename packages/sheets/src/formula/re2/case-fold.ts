// Case folding for RE2's (?i) (formulas.md "Text": the RE2 bullets). RE2 folds by Unicode's simple case folding:
// a character matches every character its orbit holds (k, K and the Kelvin sign; s, S and the long s). The orbits are
// read once from the platform's single-code-point upper and lower case maps, joined transitively. Pure once built.

import { type CodeSet, codeSet, unionSets } from './code-sets';

// Every cased character sits below this (the last, Adlam, ends at U+1E943).
const CASED_LIMIT = 0x1ffff;

let orbitsOf: Map<number, readonly number[]> | null = null;
let casedPoints: readonly number[] = [];

function single(text: string): number | null {
  const cp = text.codePointAt(0)!;
  return text.length === String.fromCodePoint(cp).length ? cp : null;
}

function buildOrbits(): Map<number, readonly number[]> {
  const parent = new Map<number, number>();
  const root = (cp: number): number => {
    let r = cp;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(cp, r);
    return r;
  };
  const join = (a: number, b: number): void => {
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let cp = 0; cp <= CASED_LIMIT; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const ch = String.fromCodePoint(cp);
    for (const other of [single(ch.toLowerCase()), single(ch.toUpperCase())])
      if (other !== null && other !== cp) join(cp, other);
  }
  const members = new Map<number, number[]>();
  for (const cp of parent.keys()) {
    const r = root(cp);
    members.set(r, [...(members.get(r) ?? []), cp]);
  }
  const orbits = new Map<number, readonly number[]>();
  for (const group of members.values()) for (const cp of group) orbits.set(cp, group);
  casedPoints = [...orbits.keys()].sort((a, b) => a - b);
  return orbits;
}

function orbits(): Map<number, readonly number[]> {
  orbitsOf ??= buildOrbits();
  return orbitsOf;
}

// The first index in the sorted cased points at or past `cp`.
function firstAtOrPast(cp: number): number {
  let lo = 0;
  let hi = casedPoints.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (casedPoints[mid]! < cp) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The set with every member's case orbit added. */
export function foldSet(set: CodeSet): CodeSet {
  const table = orbits();
  const added: [number, number][] = [];
  for (let i = 0; i < set.length; i += 2) {
    const hi = set[i + 1]!;
    for (let k = firstAtOrPast(set[i]!); k < casedPoints.length && casedPoints[k]! <= hi; k++)
      for (const cp of table.get(casedPoints[k]!)!) added.push([cp, cp]);
  }
  return unionSets(set, codeSet(added));
}
