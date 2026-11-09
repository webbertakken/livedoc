/**
 * Where each run starts when runs of the given sizes are laid end to end: the
 * running total before each one. Lets a render number items across nested
 * lists (groups of bubbles, sections of rows) without a counter it reassigns.
 */
export function runningStarts(sizes: readonly number[]): number[] {
  return sizes.reduce<number[]>((starts, _, i) => {
    starts.push(i === 0 ? 0 : starts[i - 1]! + sizes[i - 1]!);
    return starts;
  }, []);
}
