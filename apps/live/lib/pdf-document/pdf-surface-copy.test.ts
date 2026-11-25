// marks.md "Errors"; live-editing-and-storage.md "Limits", "A change carried across a replacement"; editing-modes.md
// "Errors": what the surface says when a change goes wrong.
import { describe, expect, it } from 'vitest';
import { droppedChangeCopy, lostChangesCopy } from './pdf-surface-copy';

describe('what the surface says of a change gone wrong', () => {
  it('counts the changes a replacement could not carry', () => {
    expect(lostChangesCopy(1)).toBe('1 change couldn’t be placed on the new file.');
    expect(lostChangesCopy(3)).toBe('3 changes couldn’t be placed on the new file.');
  });

  it('names why a dropped change was refused: a limit, the level, or another person’s mark', () => {
    expect(droppedChangeCopy('not_your_mark', 'participate')).toBe(
      'You can change your own marks.',
    );
    expect(droppedChangeCopy('state', 'edit')).toBe('This PDF has more unsaved changes than fit.');
    expect(droppedChangeCopy('level_too_low', 'view')).toBe(
      'You can view this PDF, but not change it.',
    );
    expect(droppedChangeCopy('level_too_low', 'participate')).toBe(
      'You can review this PDF, but not edit its pages.',
    );
  });
});
