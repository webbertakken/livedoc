// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkbookRecord } from '@livedoc/sheets';
import type { Tab } from '@livedoc/document';
import {
  addPendingDocument,
  resetPendingDocumentsForTests,
  type PendingDocumentInput,
} from '@/lib/new-document/pending-documents';
import { resetCreateHoldsForTests } from '@/lib/new-document/create-hold';
import { OFFLINE_OWNER_ID } from '@/lib/offline/offline-store';
import type { Participant } from '@/lib/identity';
import { readEditorSeed } from './seed-pending-document';

const ID = 'd0c0ffee-0000-4000-8000-0000000000cc';
const tabs = [
  { id: 't1', name: 'Board', elements: [{ id: 'e1' }] },
  { id: 't2', name: 'Sheet', elements: [] },
] as unknown as Tab[];
const PLACEHOLDER: Participant = { id: 'self', name: 'Guest', color: '#000', status: 'online' };

const add = (over: Partial<PendingDocumentInput> = {}) =>
  addPendingDocument(
    {
      id: ID,
      name: 'Untitled Kanban',
      tabs,
      itemTypes: null,
      ownerId: 'owner-1',
      location: 'livedoc',
      teamId: 'team-1',
      startedAt: 0,
      ...over,
    },
    () => new Promise(() => {}),
    {},
  );

afterEach(() => {
  resetPendingDocumentsForTests();
  resetCreateHoldsForTests();
});

describe('readEditorSeed', () => {
  it('seeds every tab whole and loaded, the created content its save baseline', () => {
    add();
    const seed = readEditorSeed(`/document/${ID}`, PLACEHOLDER)!;
    expect(seed.documentId).toBe(ID);
    expect(seed.tabs).toBe(tabs);
    expect(seed.activeId).toBe('t1');
    expect([...seed.loadedTabIds]).toEqual(['t1', 't2']);
    expect(seed.documentName).toBe('Untitled Kanban');
    expect(seed.itemTypes).toEqual({ itemTypes: null, itemTypesRev: 0 });
  });

  it('makes a LiveDoc document its creator’s, filed in its team, read by the creator', () => {
    add();
    const seed = readEditorSeed(`/document/${ID}`, PLACEHOLDER)!;
    expect(seed.ownerId).toBe('owner-1');
    expect(seed.teamId).toBe('team-1');
    expect(seed.self).toMatchObject({ id: 'owner-1', name: 'Guest', status: 'online' });
    expect(seed.self.key).toEqual(expect.any(String));
  });

  // new-document-menu.md "The blanks": a spreadsheet made from the menu opens as one, its workbook from memory.
  it('seeds a spreadsheet’s workbook record, and none for another document', () => {
    const workbook = { settings: { locale: 'en-GB' } } as unknown as WorkbookRecord;
    add({ workbook });
    expect(readEditorSeed(`/document/${ID}`, PLACEHOLDER)!.workbook).toBe(workbook);
    resetPendingDocumentsForTests();
    resetCreateHoldsForTests();
    add();
    expect(readEditorSeed(`/document/${ID}`, PLACEHOLDER)!.workbook).toBeNull();
  });

  it('makes a This Browser document the local sentinel’s', () => {
    add({ location: 'browser', teamId: null });
    expect(readEditorSeed(`/document/${ID}`, PLACEHOLDER)!.ownerId).toBe(OFFLINE_OWNER_ID);
  });

  it('seeds nothing for a document that is not pending, or a share link', () => {
    expect(readEditorSeed(`/document/${ID}`, PLACEHOLDER)).toBeNull();
    add();
    expect(readEditorSeed(`/document/${ID}?s=CODE`, PLACEHOLDER)).toBeNull();
    expect(readEditorSeed('/explorer/home', PLACEHOLDER)).toBeNull();
  });
});
