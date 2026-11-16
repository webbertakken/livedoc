import { describe, expect, it } from 'vitest';
import { ownerControlsFingerprint, type OwnerControlsState } from './owner-controls-watch';

// docs/specs/006-document/document-structure.md "An owner shown greyed controls is logged".

const state = (over: Partial<OwnerControlsState> = {}): OwnerControlsState => ({
  ready: true,
  documentOwnerId: 'acct_owner',
  accountId: 'acct_owner',
  selfId: 'acct_owner',
  isOwner: true,
  canDeleteDocument: true,
  sessionRole: 'edit',
  hasShareCode: false,
  teamDocument: false,
  workbench: false,
  otherDocuments: 2,
  addTargets: 2,
  ...over,
});

describe('ownerControlsFingerprint', () => {
  it('says nothing while the owner has every control', () => {
    expect(ownerControlsFingerprint(state())).toBeNull();
  });

  it('fingerprints an owner whose Delete and Add to Document are greyed', () => {
    const fingerprint = ownerControlsFingerprint(
      state({ isOwner: false, canDeleteDocument: false, addTargets: 0, selfId: 'guest-1' }),
    );
    expect(fingerprint).toBe(
      'OwnerControlsGreyed delete=greyed add=greyed isOwner=0 role=edit shareCode=0 team=0 workbench=0 reader=guest docs=2',
    );
  });

  it('fingerprints Delete alone, for an owner reading through a share code', () => {
    expect(ownerControlsFingerprint(state({ canDeleteDocument: false, hasShareCode: true }))).toBe(
      'OwnerControlsGreyed delete=greyed add=on isOwner=1 role=edit shareCode=1 team=0 workbench=0 reader=account docs=2',
    );
  });

  it('fingerprints Add to Document alone when isOwner drops with other documents listed', () => {
    expect(ownerControlsFingerprint(state({ isOwner: false, addTargets: 0 }))).toMatch(
      /^OwnerControlsGreyed delete=on add=greyed isOwner=0 /,
    );
  });

  it('does not count an Add to Document greyed for want of other documents', () => {
    expect(ownerControlsFingerprint(state({ otherDocuments: 0, addTargets: 0 }))).toBeNull();
  });

  it('knows a guest who owns the document by its own id', () => {
    expect(
      ownerControlsFingerprint(
        state({
          documentOwnerId: 'guest-1',
          accountId: null,
          selfId: 'guest-1',
          canDeleteDocument: false,
        }),
      ),
    ).toMatch(/ reader=guest docs=2$/);
  });

  it('names a reader that is neither the account nor a guest', () => {
    expect(ownerControlsFingerprint(state({ selfId: 'self', canDeleteDocument: false }))).toMatch(
      / reader=none /,
    );
  });

  it('stays quiet for anyone who does not own the document', () => {
    expect(
      ownerControlsFingerprint(
        state({ documentOwnerId: 'acct_other', isOwner: false, canDeleteDocument: false }),
      ),
    ).toBeNull();
  });

  it('stays quiet before the document has loaded or without an owner', () => {
    expect(ownerControlsFingerprint(state({ ready: false, canDeleteDocument: false }))).toBeNull();
    expect(
      ownerControlsFingerprint(state({ documentOwnerId: null, canDeleteDocument: false })),
    ).toBeNull();
  });

  it('stays quiet in a workbench, which holds no ownership powers', () => {
    expect(
      ownerControlsFingerprint(state({ workbench: true, canDeleteDocument: false })),
    ).toBeNull();
  });
});
