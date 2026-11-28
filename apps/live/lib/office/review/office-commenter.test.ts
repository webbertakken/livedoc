// docs/specs/034-text-documents/review.md "Threads in the margin", Who: who comments in a session.
import { describe, expect, it } from 'vitest';
import { commenterOf } from './office-commenter';

describe('commenterOf', () => {
  const self = { key: 'pk', name: 'Ada', color: '#0284c7' };
  it('signs with the room’s key for an Editor and a Participant, never for a Viewer or a read-only pane', () => {
    const of = (level: 'edit' | 'participate' | 'view', extra = {}) =>
      commenterOf({ commentKey: 'room-key', level, self, local: false, readOnly: false, ...extra });
    expect(of('edit')).toEqual({
      key: 'room-key',
      name: 'Ada',
      colour: '#0284c7',
      mayDeleteAny: true,
    });
    expect(of('participate')).toMatchObject({ key: 'room-key', mayDeleteAny: false });
    expect(of('view')).toBeNull();
    expect(of('edit', { readOnly: true })).toBeNull();
    expect(of('participate', { commentKey: null })).toBeNull();
  });

  it('signs with the person’s participant key in This Browser, never their owner id', () => {
    expect(
      commenterOf({ commentKey: null, level: 'edit', self, local: true, readOnly: false })?.key,
    ).toBe('pk');
    expect(
      commenterOf({
        commentKey: null,
        level: 'edit',
        self: { name: 'Ada', color: '#000' },
        local: true,
        readOnly: false,
      }),
    ).toBeNull();
  });
});
