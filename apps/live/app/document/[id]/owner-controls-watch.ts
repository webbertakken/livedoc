import { useEffect, useRef } from 'react';
import { recordClientError } from '@/lib/bug-report/recent-errors';
import { track } from '@/lib/telemetry';

// An owner shown greyed controls is logged (docs/specs/006-document/document-structure.md "The last tab"): the last
// tab's Delete and Add to Document are an owner's, so a session whose reader owns the document yet sees either greyed
// has reached a state no spec allows. The fingerprint holds no id, only what the editor believed.

export type OwnerControlsState = {
  // The document has loaded and the editor is showing it.
  ready: boolean;
  documentOwnerId: string | null;
  accountId: string | null | undefined;
  // The reader's participant id: the account's, a guest's, or the placeholder `self`.
  selfId: string;
  isOwner: boolean;
  canDeleteDocument: boolean;
  sessionRole: string;
  hasShareCode: boolean;
  teamDocument: boolean;
  workbench: boolean;
  // The person's other documents in the Explorer list, and how many Add to Document offers.
  otherDocuments: number;
  addTargets: number;
};

const flag = (on: boolean) => (on ? 1 : 0);

function readerKind(s: OwnerControlsState): 'account' | 'guest' | 'none' {
  if (s.selfId === 'self') return 'none';
  return s.accountId && s.selfId === s.accountId ? 'account' : 'guest';
}

// The fingerprint of an owner shown greyed controls, or null when nothing is amiss.
export function ownerControlsFingerprint(s: OwnerControlsState): string | null {
  if (!s.ready || s.workbench || s.documentOwnerId === null) return null;
  const owns = s.documentOwnerId === s.accountId || s.documentOwnerId === s.selfId;
  if (!owns) return null;
  const deleteGreyed = !s.canDeleteDocument;
  const addGreyed = s.otherDocuments > 0 && s.addTargets === 0;
  if (!deleteGreyed && !addGreyed) return null;
  return [
    'OwnerControlsGreyed',
    `delete=${deleteGreyed ? 'greyed' : 'on'}`,
    `add=${addGreyed ? 'greyed' : 'on'}`,
    `isOwner=${flag(s.isOwner)}`,
    `role=${s.sessionRole}`,
    `shareCode=${flag(s.hasShareCode)}`,
    `team=${flag(s.teamDocument)}`,
    `workbench=${flag(s.workbench)}`,
    `reader=${readerKind(s)}`,
    `docs=${s.otherDocuments}`,
  ].join(' ');
}

// Logs each distinct fingerprint once per document open: the console, telemetry, and the bug report's recent errors.
export function useOwnerControlsWatch(documentId: string | null, state: OwnerControlsState): void {
  const fingerprint = ownerControlsFingerprint(state);
  const logged = useRef(new Set<string>());
  useEffect(() => {
    if (!fingerprint || !documentId) return;
    const key = `${documentId} ${fingerprint}`;
    if (logged.current.has(key)) return;
    logged.current.add(key);
    console.warn(`[owner-controls-greyed] ${fingerprint}`);
    track('Error', 'Warning', 'OwnerControlsGreyed');
    recordClientError('warning', fingerprint);
  }, [documentId, fingerprint]);
}
