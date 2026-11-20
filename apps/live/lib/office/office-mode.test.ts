import { describe, expect, it } from 'vitest';
import { levelInMode, modesFor, startingMode } from './office-mode';

// docs/specs/034-text-documents/review.md "Editing modes".
describe('the editing modes', () => {
  it('lists what each level may use', () => {
    expect(modesFor('edit').map((m) => m.mode)).toEqual(['editing', 'suggesting', 'viewing']);
    expect(modesFor('participate').map((m) => m.mode)).toEqual(['suggesting', 'viewing']);
    expect(modesFor('view').map((m) => m.mode)).toEqual(['viewing']);
  });

  it('starts at the most a level allows of what is built', () => {
    expect(startingMode('edit')).toBe('editing');
    // Suggesting is not built yet: a Participant starts in Viewing.
    expect(startingMode('participate')).toBe('viewing');
    expect(startingMode('view')).toBe('viewing');
  });

  it('never draws more than the level', () => {
    expect(levelInMode('edit', 'editing')).toBe('edit');
    expect(levelInMode('edit', 'viewing')).toBe('view');
    expect(levelInMode('edit', 'suggesting')).toBe('participate');
    expect(levelInMode('view', 'suggesting')).toBe('view');
  });
});
