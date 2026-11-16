import { describe, expect, it } from 'vitest';
import { resolveDocumentSession } from './document-session';

describe('resolveDocumentSession (owner / role / share-code security)', () => {
  // docs/specs/013-workspace/share-roles.md: a Participant link opens at its level; its embed only looks.
  it('opens a Participant link as a Participant, and its embed as a Viewer', () => {
    const base = { documentOwnerId: 'owner', selfId: 'visitor', shareCodeParam: 'C' };
    expect(resolveDocumentSession({ ...base, shareRole: 'participate' }).sessionRole).toBe(
      'participate',
    );
    expect(
      resolveDocumentSession({ ...base, shareRole: 'participate', embed: true }).sessionRole,
    ).toBe('view');
    expect(resolveDocumentSession({ ...base, shareRole: 'edit', embed: true }).sessionRole).toBe(
      'edit',
    );
  });

  it('owner: always edit, no share code, even when arriving via a share URL', () => {
    const s = resolveDocumentSession({
      documentOwnerId: 'me',
      selfId: 'me',
      shareRole: 'view', // a stale view code on the owner's own URL must not downgrade them
      shareCodeParam: 'CODE2345',
    });
    expect(s.isOwner).toBe(true);
    expect(s.sessionRole).toBe('edit');
    expect(s.sessionShareCode).toBeNull();
  });

  it('edit-role visitor: inherits edit, carries their code', () => {
    const s = resolveDocumentSession({
      documentOwnerId: 'someone-else',
      selfId: 'me',
      shareRole: 'edit',
      shareCodeParam: 'CODE2345',
    });
    expect(s.isOwner).toBe(false);
    expect(s.sessionRole).toBe('edit');
    expect(s.sessionShareCode).toBe('CODE2345');
  });

  it('view-role visitor: stays view, carries their code', () => {
    const s = resolveDocumentSession({
      documentOwnerId: 'someone-else',
      selfId: 'me',
      shareRole: 'view',
      shareCodeParam: 'CODE2345',
    });
    expect(s.isOwner).toBe(false);
    expect(s.sessionRole).toBe('view');
    expect(s.sessionShareCode).toBe('CODE2345');
  });
});
