// The one create of a new document (docs/specs/007-editor/new-document-route.md, docs/specs/013-workspace/
// new-document-menu.md "Opening at once"): `/new`, the workspace frame's New document and the Explorer's New Document
// menu each build the content (new-document-content.ts) and write it here, so a document made from any of them is the
// same document, stored and filed the same way.
import { creationIntentOf } from '@livedoc/api-schema';
import { templateFamilyOf, type TemplateKind } from '@livedoc/templates';
import { apiCreateDocument } from '@/lib/api-client';
import type { Participant } from '@/lib/identity';
import { offlineCreateDocument } from '@/lib/offline/offline-store';
import { offlineWriteItem } from '@/lib/offline/offline-items';
import { seedAuthor } from '@/lib/seed-author';
import { isOfflineLocation, type SaveLocationId } from '@/lib/save-locations';
import { titleCaseType, track } from '@/lib/telemetry';
import { themeTelemetryLabel } from '@/lib/custom-theme-registry';
import { withTemplateSheets } from '@/lib/template-sheets';
import type { CreateIds } from './create-failure';
import type { NewDocumentContent } from '@/lib/new-document-content';
import { NEW_DOCUMENT_THEME_ID } from './new-document-theme';

export type NewDocumentWrite = {
  ids: CreateIds;
  name: string;
  templateKind: TemplateKind | null;
  content: NewDocumentContent;
  location: SaveLocationId;
  // Who it is made as: asked only for a LiveDoc create (the owner) and a This Browser one with example cards (their
  // author), so a This Browser create never waits on identity it does not need.
  creator: () => Promise<Pick<Participant, 'id' | 'name' | 'color'>>;
  // The placement: absent is no choice, where a default folder may answer; a null folder is the root, chosen.
  teamId?: string | null;
  folderId?: string | null;
};

export async function writeNewDocument(write: NewDocumentWrite): Promise<void> {
  const { ids, name, templateKind, content, location, creator } = write;
  const { tabs, tab, itemTypes, seedItems } = content;
  if (isOfflineLocation(location)) {
    // Offline Mode (docs/specs/006-document/offline-mode.md): IndexedDB only, which also registers the id so every
    // later load and save routes here. A template's Sheets are made with it, as the api's create makes them
    // (docs/specs/029-sheets/sheet-store.md "Template starts").
    const made = tabs ? await withTemplateSheets(tabs, Date.now()) : null;
    await offlineCreateDocument(
      {
        id: ids.documentId,
        name,
        tabs: made?.tabs ?? tabs ?? [tab],
        itemTypes,
        ...(made?.sheets.length ? { sheets: made.sheets } : {}),
      },
      Date.now(),
    );
    // Its example cards, through the same checks the api's create puts them through (offline-items.ts).
    if (seedItems.length) {
      await offlineWriteItem(
        ids.documentId,
        { kind: 'create', creates: seedItems },
        await seedAuthor(await creator()),
      );
    }
    return;
  }
  const owner = await creator();
  // Placement rides the create (docs/specs/007-editor/new-document-route.md): filed by the same write, or refused by
  // name and nothing is written.
  await apiCreateDocument(owner.id, {
    id: ids.documentId,
    name,
    tabs: tabs ?? [tab],
    ...(itemTypes ? { itemTypes } : {}),
    ...(seedItems.length ? { items: seedItems } : {}),
    teamId: write.teamId,
    folderId: write.folderId,
    // What it opens as, captured now and never re-derived (docs/specs/013-workspace/default-folders.md).
    intent: creationIntentOf(tab, templateFamilyOf(templateKind)),
  });
}

// What a landed create tells telemetry (docs/specs/017-telemetry/telemetry.md): which store, the theme, the template,
// and a team library joined. No id or name is sent.
export function trackNewDocumentCreated(made: {
  location: SaveLocationId;
  templateKind: TemplateKind | null;
  teamId?: string | null;
}): void {
  const offline = isOfflineLocation(made.location);
  track('Document', 'Created', offline ? 'Offline' : 'Cloud');
  track('Theme', 'Changed', themeTelemetryLabel(NEW_DOCUMENT_THEME_ID));
  if (made.templateKind) track('Template', 'Used', titleCaseType(made.templateKind));
  // A whiteboard tab born from a create (docs/specs/023-draw-mode/draw-mode.md "Telemetry").
  if (made.templateKind === 'whiteboard') track('Draw', 'Created', 'Template');
  if (!offline && made.teamId) track('Team', 'Added', 'Document');
}
