import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { base64OfBytes } from '@livedoc/text-documents/base64';
import {
  UNRECORDED_EDITOR,
  VERSION_UNRECORDED_COLOUR,
  versionAuthorship,
} from './text-document-version-authorship';

// docs/specs/034-text-documents/review.md "Version history", Show changes: each editor's changes in their colour; one
// whose author went unrecorded in the neutral grey.

const deletions = (client: number, clock: number, len: number) => {
  const ds = Y.createDeleteSet();
  ds.clients.set(client, [{ clock, len }]);
  return base64OfBytes(Y.encodeSnapshot(Y.createSnapshot(ds, new Map())));
};

describe('versionAuthorship', () => {
  const authorship = versionAuthorship({
    clients: {
      '7': { key: 'k-ada', name: 'Ada', color: '#0284c7' },
      '8': { key: null, name: null, color: null },
      '9': { key: 'k-bo', name: 'Bo', color: 'red' },
      x: { key: 'k-x', name: 'X', color: '#000000' },
    },
    deletedBy: { 'k-ada': deletions(5, 0, 3), 'k-cy': deletions(5, 10, 1), broken: '%%' },
  });
  const pud = authorship.permanentUserData;

  it('names each client by its author’s key, unrecorded where it has none', () => {
    expect(pud.getUserByClientId(7)).toBe('k-ada');
    expect(pud.getUserByClientId(8)).toBe(UNRECORDED_EDITOR);
    expect(pud.getUserByClientId(42)).toBe(UNRECORDED_EDITOR);
  });

  it('names each deletion by the key whose recorded deletions hold it', () => {
    expect(pud.getUserByDeletedId(Y.createID(5, 2))).toBe('k-ada');
    expect(pud.getUserByDeletedId(Y.createID(5, 10))).toBe('k-cy');
    expect(pud.getUserByDeletedId(Y.createID(5, 4))).toBe(UNRECORDED_EDITOR);
    expect([...pud.dss.keys()]).toEqual(['k-ada', 'k-cy']);
  });

  it('colours each editor in their own colour, else the neutral grey', () => {
    const grey = { light: VERSION_UNRECORDED_COLOUR, dark: VERSION_UNRECORDED_COLOUR };
    expect(authorship.colorMapping.get('k-ada')).toEqual({ light: '#0284c7', dark: '#0284c7' });
    expect(authorship.colorMapping.get('k-bo')).toEqual(grey);
    expect(authorship.colorMapping.get('k-cy')).toEqual(grey);
    expect(authorship.colorMapping.get(UNRECORDED_EDITOR)).toEqual(grey);
    expect(authorship.colorMapping.has('k-x')).toBe(false);
    expect(authorship.colors).toEqual([grey]);
  });
});
