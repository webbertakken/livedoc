// A drawn row's place without its motion (docs/specs/013-workspace/explorer-structure.md "Long lists", "Back"): a row
// rising in with the list's cascade is drawn a few pixels below its place, and a place measured then would be kept, or
// taken back, that many pixels off. Measuring reads where the layout put the row, never where the motion has it now.

/** How far a computed `transform` moves an element down, in CSS pixels; 0 for none or one it cannot read. */
export function transformShiftY(transform: string): number {
  const values = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!values) return 0;
  const numbers = values[2]!.split(',').map((v) => Number.parseFloat(v));
  const shift = values[1] ? numbers[13] : numbers[5];
  return shift !== undefined && Number.isFinite(shift) ? shift : 0;
}

/** An element's top in the viewport where the layout put it, its own transform taken away. */
export function layoutTopOf(element: Element): number {
  return element.getBoundingClientRect().top - transformShiftY(getComputedStyle(element).transform);
}
