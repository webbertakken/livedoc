import { describe, expect, it } from 'vitest';
import { levelInMode, modesFor, startingMode } from '@/lib/office/office-mode';
import { TEXT_DOCUMENT_MODES } from './text-document-modes';

// docs/specs/034-text-documents/review.md "Editing modes": Editing, Suggesting and Viewing, as Google's.
describe("a text document's modes", () => {
  it('lists what each level may use', () => {
    const ids = (level: 'edit' | 'participate' | 'view') =>
      modesFor(TEXT_DOCUMENT_MODES, level).map((m) => m.mode);
    expect(ids('edit')).toEqual(['editing', 'suggesting', 'viewing']);
    expect(ids('participate')).toEqual(['suggesting', 'viewing']);
    expect(ids('view')).toEqual(['viewing']);
    expect(TEXT_DOCUMENT_MODES.map((m) => [m.label, m.item])).toEqual([
      ['Editing', 'mode-editing'],
      ['Suggesting', 'mode-suggesting'],
      ['Viewing', 'mode-viewing'],
    ]);
  });

  it('starts at the most a level allows of what is built', () => {
    expect(startingMode(TEXT_DOCUMENT_MODES, 'edit')).toBe('editing');
    // A Participant starts in Suggesting (fork D7, ruled).
    expect(startingMode(TEXT_DOCUMENT_MODES, 'participate')).toBe('suggesting');
    expect(startingMode(TEXT_DOCUMENT_MODES, 'view')).toBe('viewing');
  });

  it('never draws more than the level', () => {
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'edit', 'editing')).toBe('edit');
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'edit', 'viewing')).toBe('view');
    // Suggesting draws an Editor's menus, never more than the session's.
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'edit', 'suggesting')).toBe('edit');
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'participate', 'suggesting')).toBe('participate');
    expect(levelInMode(TEXT_DOCUMENT_MODES, 'view', 'suggesting')).toBe('view');
  });
});
