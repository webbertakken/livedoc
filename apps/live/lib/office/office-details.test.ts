import { describe, expect, it } from 'vitest';
import {
  documentFactsFrom,
  locationWords,
  modifiedWords,
  officeDetailsRows,
  ownerWords,
  type OfficeDocumentFacts,
} from './office-details';

// docs/specs/034-text-documents/files-and-print.md "Details"
const AT = Date.UTC(2026, 10, 28, 11, 20);
const LATER = Date.UTC(2026, 10, 28, 11, 42);
const when = { locale: 'en-GB', timeZone: 'UTC' };

const folders = [
  { id: 'f1', name: 'Plans', parentId: null },
  { id: 'f2', name: '2027', parentId: 'f1' },
];

describe('ownerWords', () => {
  it('says You for the owner, the name for anyone else, and Not known without one', () => {
    expect(ownerWords({ you: true })).toBe('You');
    expect(ownerWords({ you: false, name: 'Ada' })).toBe('Ada');
    expect(ownerWords({ you: false, name: null })).toBe('Not known');
  });
});

describe('locationWords', () => {
  it('names the place, then its folders', () => {
    expect(locationWords({ place: 'this-browser' })).toBe('This Browser');
    expect(locationWords({ place: 'mine', folders: [] })).toBe('My Documents');
    expect(locationWords({ place: 'mine', folders: ['Plans', '2027'] })).toBe(
      'My Documents › Plans › 2027',
    );
    expect(locationWords({ place: 'team', team: 'Design', folders: ['Q3'] })).toBe('Design › Q3');
    expect(locationWords({ place: 'shared' })).toBe('Shared with you');
  });
});

describe('modifiedWords', () => {
  it('says when and by whom', () => {
    expect(modifiedWords({ at: LATER, by: 'Ada' }, when)).toBe('28 Nov 2026, 11:42 by Ada');
  });

  it('says when alone where nobody is known', () => {
    expect(modifiedWords({ at: LATER, by: null }, when)).toBe('28 Nov 2026, 11:42');
  });
});

describe('officeDetailsRows', () => {
  const facts: OfficeDocumentFacts = {
    owner: { you: true },
    location: { place: 'mine', folders: ['Plans'] },
    createdAt: AT,
    savedAt: LATER,
  };

  it('gives Owner, Location, Created and Modified in order', () => {
    expect(officeDetailsRows(facts, null, when)).toEqual([
      { label: 'Owner', value: 'You' },
      { label: 'Location', value: 'My Documents › Plans' },
      { label: 'Created', value: '28 Nov 2026, 11:20' },
      { label: 'Modified', value: '28 Nov 2026, 11:42' },
    ]);
  });

  it('prefers the last edit read from LiveDoc for Modified', () => {
    const rows = officeDetailsRows(facts, { at: LATER + 60_000, by: 'Ada' }, when);
    expect(rows[3]).toEqual({ label: 'Modified', value: '28 Nov 2026, 11:43 by Ada' });
  });

  it('says a date not known as -', () => {
    const rows = officeDetailsRows({ ...facts, createdAt: null, savedAt: null }, null, when);
    expect(rows[2]!.value).toBe('-');
    expect(rows[3]!.value).toBe('-');
  });
});

describe('documentFactsFrom', () => {
  const base = {
    documentId: 'd1',
    offline: false,
    isOwner: true,
    ownerName: 'Grace',
    teamId: null,
    documents: [] as { id: string; folderId: string | null; createdAt: number; savedAt: number }[],
    folders,
    teamDocuments: [],
    teamFolders: [],
    teams: [],
    opened: null,
  };

  it('places a document of the person’s own in its folders, with its dates', () => {
    const facts = documentFactsFrom({
      ...base,
      documents: [{ id: 'd1', folderId: 'f2', createdAt: AT, savedAt: LATER }],
    });
    expect(facts).toEqual({
      owner: { you: true },
      location: { place: 'mine', folders: ['Plans', '2027'] },
      createdAt: AT,
      savedAt: LATER,
    });
  });

  it('places a document in This Browser there, the person’s own', () => {
    const facts = documentFactsFrom({
      ...base,
      offline: true,
      isOwner: false,
      documents: [{ id: 'd1', folderId: 'f1', createdAt: AT, savedAt: LATER }],
    });
    expect(facts.location).toEqual({ place: 'this-browser' });
    expect(facts.owner).toEqual({ you: true });
  });

  it('places a team’s document in the team and its folders', () => {
    const facts = documentFactsFrom({
      ...base,
      isOwner: false,
      teamId: 't1',
      teamDocuments: [
        {
          id: 'd1',
          folderId: 'g1',
          createdAt: AT,
          savedAt: LATER,
          team: { id: 't1', name: 'Design' },
        },
      ],
      teamFolders: [{ id: 'g1', name: 'Q3', parentId: null, teamId: 't1' }],
    });
    expect(facts.location).toEqual({ place: 'team', team: 'Design', folders: ['Q3'] });
    expect(facts.owner).toEqual({ you: false, name: 'Grace' });
    expect(facts.createdAt).toBe(AT);
  });

  it('names the team from the person’s teams before its library is read', () => {
    const facts = documentFactsFrom({
      ...base,
      teamId: 't1',
      teams: [{ id: 't1', name: 'Design' }],
      opened: { createdAt: AT, savedAt: LATER },
    });
    expect(facts.location).toEqual({ place: 'team', team: 'Design', folders: [] });
    expect(facts.createdAt).toBe(AT);
  });

  it('says anyone else’s document is shared with the person, dated as it was opened', () => {
    const facts = documentFactsFrom({
      ...base,
      isOwner: false,
      opened: { createdAt: AT, savedAt: LATER },
    });
    expect(facts).toEqual({
      owner: { you: false, name: 'Grace' },
      location: { place: 'shared' },
      createdAt: AT,
      savedAt: LATER,
    });
  });

  it('knows no dates before the document is read', () => {
    const facts = documentFactsFrom({ ...base, isOwner: false });
    expect(facts.createdAt).toBeNull();
    expect(facts.savedAt).toBeNull();
  });
});
