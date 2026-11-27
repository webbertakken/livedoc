// Find and Replace's words (docs/specs/029-sheets/data-tools.md "Find and replace", D457, D458).

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const FIND_LOOPED = 'No more results, looping around';
export const FIND_REGEX_REFUSED = 'Enter a valid regular expression';
export const FIND_RANGE_UNREAD = 'Enter a range, like A1:B4 or Sheet2!A1:B4';

export const findNoResults = (find: string) => `No results for "${find}"`;

/** Replace All's line: the matches replaced, and the protected cells it left. */
export function findReplacedLine(
  instances: number,
  find: string,
  by: string,
  protectedLeft: number,
): string {
  const done = `Replaced ${instances} ${plural(instances, 'instance', 'instances')} of "${find}" with "${by}"`;
  if (!protectedLeft) return done;
  const left = `${protectedLeft} protected ${plural(protectedLeft, 'cell was left as it was', 'cells were left as they were')}`;
  return `${done}. ${left}.`;
}
