// @vitest-environment jsdom
// review.md "Version history": the keys between changes go in reading order, a block's own text not counted again,
// and stop at either end.
import { describe, expect, it } from 'vitest';
import {
  changeAnnouncement,
  CURRENT_CHANGE,
  stepVersionChange,
  versionChanges,
} from './text-document-version-changes';

function drawn() {
  const root = document.createElement('div');
  root.innerHTML = `
    <p>kept <span data-ychange="added">one</span> and <span data-ychange="removed">two</span></p>
    <p data-ychange="added"><span data-ychange="added">a whole paragraph</span></p>`;
  return root;
}

const current = (root: HTMLElement) => root.querySelector(`[${CURRENT_CHANGE}]`)?.textContent;

describe('version changes', () => {
  it('lists each change once, in reading order', () => {
    expect(versionChanges(drawn()).map((c) => c.textContent)).toEqual([
      'one',
      'two',
      'a whole paragraph',
    ]);
  });

  it('steps forward and back, stopping at either end', () => {
    const root = drawn();
    expect(stepVersionChange(root, true)).toEqual({ index: 1, count: 3 });
    expect(current(root)).toBe('one');
    stepVersionChange(root, true);
    stepVersionChange(root, true);
    expect(stepVersionChange(root, true)).toEqual({ index: 3, count: 3 });
    expect(current(root)).toBe('a whole paragraph');
    expect(stepVersionChange(root, false)).toEqual({ index: 2, count: 3 });
    expect(root.querySelectorAll(`[${CURRENT_CHANGE}]`)).toHaveLength(1);
  });

  it('starts from the last going back, and finds nothing where nothing changed', () => {
    expect(stepVersionChange(drawn(), false)).toEqual({ index: 3, count: 3 });
    expect(stepVersionChange(document.createElement('div'), true)).toBeNull();
    expect(changeAnnouncement({ index: 2, count: 5 })).toBe('Change 2 of 5');
  });
});
