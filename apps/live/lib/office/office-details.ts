// File > Details (docs/specs/034-text-documents/files-and-print.md "Details"): the facts every office kind shares
// (owner, location, created, modified), read from what the editor page holds, and the dialog's first four rows. A
// kind adds its own rows after these (a text document's format, size and counts).
import { folderBreadcrumb } from '@/lib/folder-tree';
import { formatDateTime } from '@/app/explorer/details/details-format';

export type OfficeLocation =
  | { readonly place: 'this-browser' }
  | { readonly place: 'mine'; readonly folders: readonly string[] }
  | { readonly place: 'team'; readonly team: string; readonly folders: readonly string[] }
  | { readonly place: 'shared' };

export type OfficeDocumentFacts = {
  readonly owner: { readonly you: true } | { readonly you: false; readonly name: string | null };
  readonly location: OfficeLocation;
  readonly createdAt: number | null;
  readonly savedAt: number | null;
};

/** The last edit LiveDoc recorded: when, and who (null where nobody is known). */
export type OfficeModified = { readonly at: number; readonly by: string | null };

export type OfficeDetailsRow = { readonly label: string; readonly value: string };

/** A reader's locale and time zone; both the reader's own (undefined) outside tests. */
export type OfficeWhen = { readonly locale?: string; readonly timeZone?: string };

/** A date the dialog does not know. */
export const NOT_KNOWN_DATE = '-';
const FOLDER_SEPARATOR = ' › ';

export const ownerWords = (owner: OfficeDocumentFacts['owner']): string =>
  owner.you ? 'You' : (owner.name ?? 'Not known');

export function locationWords(location: OfficeLocation): string {
  switch (location.place) {
    case 'this-browser':
      return 'This Browser';
    case 'shared':
      return 'Shared with you';
    case 'mine':
      return ['My Documents', ...location.folders].join(FOLDER_SEPARATOR);
    case 'team':
      return [location.team, ...location.folders].join(FOLDER_SEPARATOR);
  }
}

const dateWords = (at: number | null, when: OfficeWhen): string =>
  at === null ? NOT_KNOWN_DATE : formatDateTime(at, when);

export const modifiedWords = (modified: OfficeModified, when: OfficeWhen): string =>
  modified.by === null
    ? dateWords(modified.at, when)
    : `${dateWords(modified.at, when)} by ${modified.by}`;

/** Owner, Location, Created and Modified: the last edit where LiveDoc knows it, else the last save. */
export function officeDetailsRows(
  facts: OfficeDocumentFacts,
  modified: OfficeModified | null,
  when: OfficeWhen = {},
): OfficeDetailsRow[] {
  return [
    { label: 'Owner', value: ownerWords(facts.owner) },
    { label: 'Location', value: locationWords(facts.location) },
    { label: 'Created', value: dateWords(facts.createdAt, when) },
    {
      label: 'Modified',
      value: modified ? modifiedWords(modified, when) : dateWords(facts.savedAt, when),
    },
  ];
}

type Folder = { readonly id: string; readonly name: string; readonly parentId: string | null };
type Listed = {
  readonly id: string;
  readonly folderId: string | null;
  // Absent where the list was read without it.
  readonly createdAt?: number;
  readonly savedAt: number;
};

type TeamListed = Listed & { readonly team: { readonly id: string; readonly name: string } };

/** The document's dates as the editor page read it. */
export type DocumentOpenedDates = { readonly createdAt: number; readonly savedAt: number };

/** What the editor page holds about the open document, as File > Details reads it. */
export type OfficeFactSources = {
  readonly documentId: string;
  // In This Browser: the person's own, wherever it is listed.
  readonly offline: boolean;
  readonly isOwner: boolean;
  readonly ownerName: string | null;
  readonly teamId: string | null;
  // The person's own documents and folders.
  readonly documents: readonly Listed[];
  readonly folders: readonly Folder[];
  // The libraries of the person's teams, once read, and the teams themselves.
  readonly teamDocuments: readonly TeamListed[];
  readonly teamFolders: readonly (Folder & { readonly teamId: string })[];
  readonly teams: readonly { readonly id: string; readonly name: string }[];
  // The document's dates as it was read; null before.
  readonly opened: DocumentOpenedDates | null;
};

const breadcrumb = (folders: readonly Folder[], folderId: string | null): string[] =>
  folderBreadcrumb(new Map(folders.map((f) => [f.id, f])), folderId).map((f) => f.name);

export function documentFactsFrom(s: OfficeFactSources): OfficeDocumentFacts {
  const owner: OfficeDocumentFacts['owner'] =
    s.isOwner || s.offline ? { you: true } : { you: false, name: s.ownerName };
  const mine = s.documents.find((d) => d.id === s.documentId);
  const team = s.teamDocuments.find((d) => d.id === s.documentId);
  const dates = team ?? mine ?? s.opened;
  return {
    owner,
    location: locationOf(s, mine, team),
    createdAt: dates?.createdAt ?? null,
    savedAt: dates?.savedAt ?? null,
  };
}

function locationOf(
  s: OfficeFactSources,
  mine: Listed | undefined,
  team: TeamListed | undefined,
): OfficeLocation {
  if (s.offline) return { place: 'this-browser' };
  const teamName = team?.team.name ?? s.teams.find((t) => t.id === s.teamId)?.name;
  if (s.teamId && teamName) {
    const folders = s.teamFolders.filter((f) => f.teamId === s.teamId);
    return { place: 'team', team: teamName, folders: breadcrumb(folders, team?.folderId ?? null) };
  }
  if (mine) return { place: 'mine', folders: breadcrumb(s.folders, mine.folderId) };
  return { place: 'shared' };
}
