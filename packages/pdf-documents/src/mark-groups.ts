// A mark's group (docs/specs/035-pdf-documents/marks.md "Changing a mark", "In the file"): the marks of one page that
// share a group move and answer as one; a group holding one mark acts as none. A file groups its marks the standard's
// way, each grouped mark naming the group's head (`IRT`, `RT` `Group`): read here as one group named for the head.
import type { FileMark } from './engine-contract';
import type { Mark } from './mark';

export const MarkGroups = {
  /** The ids of `id`'s group on its page, in the order given; `[id]` where it has none, is alone in it, or is gone. */
  members: (marks: readonly Mark[], id: string): readonly string[] => {
    const mark = marks.find((each) => each.id === id);
    if (!mark?.group) return [id];
    const group = marks
      .filter((each) => each.page === mark.page && each.group === mark.group)
      .map((each) => each.id);
    return group.length > 1 ? group : [id];
  },
  /** The ids, each widened to its whole group, each once, in the order first met. */
  widen: (marks: readonly Mark[], ids: readonly string[]): readonly string[] => [
    ...new Set(ids.flatMap((id) => [id, ...MarkGroups.members(marks, id)])),
  ],
  /** Whether any of the ids is in a group of two or more. */
  anyGrouped: (marks: readonly Mark[], ids: readonly string[]): boolean =>
    ids.some((id) => MarkGroups.members(marks, id).length > 1),
} as const;

/** A file's marks with their groups: a grouped answer and the head it names take the head's id. */
export function withFileGroups(marks: readonly FileMark[]): readonly FileMark[] {
  const heads = new Set(
    marks.flatMap((each) => (each.answers?.grouped ? [each.answers.mark] : [])),
  );
  return marks.map((each) => {
    const group = each.answers?.grouped ? each.answers.mark : heads.has(each.id) ? each.id : null;
    return group && each.mark ? { ...each, mark: { ...each.mark, group } } : each;
  });
}
