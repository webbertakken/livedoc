import { describe, expect, it } from 'vitest';
import type { FileMark } from './engine-contract';
import { Mark } from './mark';
import { MarkGroups, withFileGroups } from './mark-groups';
import { PageName } from './page-name';

const one = PageName.ofObject(3);
const two = PageName.ofObject(4);
const mark = (id: string, group?: string, page = one) =>
  Mark.drawing({
    id,
    page,
    strokes: [[1, 1, 2, 2]],
    width: 2,
    colour: '#ff0000',
    opacity: 1,
    author: 'Ada',
    createdAt: 1,
    ...(group ? { group } : {}),
  })!;

// marks.md "Changing a mark": a group is the marks of one page that share it; a group of one acts as none.
describe('MarkGroups.members', () => {
  const marks = [mark('a', 'g'), mark('b', 'g'), mark('c'), mark('d', 'h'), mark('e', 'g', two)];

  it('answers the marks of the mark’s group on its page', () => {
    expect(MarkGroups.members(marks, 'b')).toEqual(['a', 'b']);
  });

  it('answers the mark alone where it has no group, is alone in it, or is not there', () => {
    expect(MarkGroups.members(marks, 'c')).toEqual(['c']);
    expect(MarkGroups.members(marks, 'd')).toEqual(['d']);
    expect(MarkGroups.members(marks, 'e')).toEqual(['e']);
    expect(MarkGroups.members(marks, 'zz')).toEqual(['zz']);
  });

  it('widens ids to their whole groups, each once, in the order given', () => {
    expect(MarkGroups.widen(marks, ['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
    expect(MarkGroups.widen(marks, ['b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('says whether any of the ids is grouped', () => {
    expect(MarkGroups.anyGrouped(marks, ['c', 'a'])).toBe(true);
    expect(MarkGroups.anyGrouped(marks, ['c', 'd'])).toBe(false);
  });
});

// marks.md "In the file": a file's marks grouped by IRT and RT Group read as one group, named for the head.
describe('withFileGroups', () => {
  const fileMark = (id: string, answers: FileMark['answers'], read = true): FileMark =>
    ({ id, answers, mark: read ? mark(id) : null }) as unknown as FileMark;

  it('gives a grouped answer and its head the head’s id as their group', () => {
    const read = withFileGroups([
      fileMark('h', null),
      fileMark('m', { mark: 'h', grouped: true }),
      fileMark('r', { mark: 'h', grouped: false }),
      fileMark('x', null),
    ]);
    expect(read.map((each) => each.mark?.group ?? null)).toEqual(['h', 'h', null, null]);
  });

  it('leaves marks LiveDoc cannot read as they are', () => {
    const read = withFileGroups([
      fileMark('h', null, false),
      fileMark('m', { mark: 'h', grouped: true }),
    ]);
    expect(read[0]!.mark).toBeNull();
    expect(read[1]!.mark?.group).toBe('h');
  });
});
