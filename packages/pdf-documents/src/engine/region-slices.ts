// A region's run set slice by slice (docs/specs/035-pdf-documents/marks.md "Laying out"): Chinese, Japanese and Korean
// are measured as one face a region, but each slice is a font of its own, so the bake cuts a region's run into
// stretches of the slice that holds each character. Pure.
import type { MarkFaceSlice } from '../mark-face-families';
import type { MarkRun } from '../mark-faces';
import { rangesOf } from './mark-face-table';

/** Which slice holds each character: the first whose range holds it. */
export function sliceIndex<Slice extends Pick<MarkFaceSlice, 'range'>>(
  slices: readonly Slice[],
): ReadonlyMap<number, Slice> {
  const index = new Map<number, Slice>();
  for (const slice of slices)
    for (const [first, last] of rangesOf(slice.range))
      for (let code = first; code <= last; code += 1) if (!index.has(code)) index.set(code, slice);
  return index;
}

/**
 * A region's run cut into runs of one slice each; a character no slice holds stays in the slice before it, or the
 * first slice where it starts the run.
 */
export function splitRun(
  { text }: MarkRun,
  index: ReadonlyMap<number, MarkFaceSlice>,
  slices: readonly MarkFaceSlice[],
): MarkRun[] {
  const runs: { face: string; text: string }[] = [];
  for (const character of Array.from(text)) {
    const before = runs.at(-1);
    const face = index.get(character.codePointAt(0)!)?.id ?? before?.face ?? slices[0]!.id;
    if (before?.face === face) before.text += character;
    else runs.push({ face, text: character });
  }
  return runs;
}
