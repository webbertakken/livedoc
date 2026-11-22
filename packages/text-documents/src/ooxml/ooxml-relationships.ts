// Relationships as a written package lists them (ISO/IEC 29500-2): one source part's, kept ones first with their ids.
import type { Relationship } from '@livedoc/office-packages';

/** Relationships of one source part: kept ones first with their ids, new ones numbered after the highest kept id. */
export class RelationshipList {
  readonly list: Relationship[];
  /** The part whose relationships these are, which targets are relative to. */
  readonly source: string;
  #next: number;

  constructor(kept: readonly Relationship[], source = '') {
    this.list = [...kept];
    this.source = source;
    const numbers = kept.map((r) => Number(r.id.match(/^rId(\d+)$/)?.[1] ?? 0));
    this.#next = Math.max(0, ...numbers) + 1;
  }

  /** The id of a relationship of this type and target: an existing one, or a new one. */
  id(type: string, target: string, external = false): string {
    const found = this.list.find(
      (r) => r.type === type && r.target === target && !!r.external === external,
    );
    if (found) return found.id;
    let id = `rId${this.#next++}`;
    while (this.list.some((r) => r.id === id)) id = `rId${this.#next++}`;
    this.list.push({ id, type, target, ...(external ? { external } : {}) });
    return id;
  }
}

/** A part's name as a target relative to the part that names it. */
export const relativeTarget = (from: string, to: string) => {
  const dir = from.split('/').slice(0, -1);
  const parts = to.split('/');
  let i = 0;
  while (i < dir.length && dir[i] === parts[i]) i += 1;
  return [...dir.slice(i).map(() => '..'), ...parts.slice(i)].join('/');
};
