// New document in a workspace frame (docs/specs/013-workspace/workbench-embeds.md "What renders", WB58):
// never the /new wizard. The wizard's href says where and what (`folder`, `team`,
// `template`); the place the frame shows fills in where it says nothing, a folder view its folder and a team page its
// team. The document is made as /new makes it (lib/new-document-content.ts) and opened in the frame.
import { untitledNameForTemplate, type TemplateKind } from '@livedoc/templates';
import { NEW_DOCUMENT_THEME_ID, newDocumentContent } from '@/lib/new-document-content';
import { writeNewDocument } from '@/lib/new-document/write-new-document';
import { wizardBypassKind } from '@/lib/new-document-params';
import type { WorkspacePlace } from '@/lib/workbench/workspace-place';

export type CreateInPlace = {
  // A folder; `null` the root chosen on purpose; `undefined` no choice, where a default folder may answer.
  folderId: string | null | undefined;
  teamId: string | null;
  // The template the href names; null makes a blank that opens on the editor's start, with the templates.
  templateKind: TemplateKind | null;
};

export function createInPlaceOf(
  href: string,
  origin: string,
  place: WorkspacePlace,
): CreateInPlace {
  const search = new URL(href, origin).searchParams;
  const templateKind = wizardBypassKind(search.toString());
  const folder = search.get('folder');
  const team = search.get('team');
  if (folder || team) return { folderId: folder ?? undefined, teamId: team, templateKind };
  if (place.kind === 'explorer' && place.node.kind === 'folder')
    return { folderId: place.node.id, teamId: null, templateKind };
  if (place.kind === 'explorer' && place.node.kind === 'team')
    return { folderId: null, teamId: place.node.id, templateKind };
  return { folderId: undefined, teamId: null, templateKind };
}

// Makes the document and answers its id; throws when the api refuses or cannot be reached.
export async function createDocumentInPlace(
  ownerId: string,
  request: CreateInPlace,
): Promise<string> {
  const { templateKind } = request;
  const documentId = crypto.randomUUID();
  const tabId = crypto.randomUUID();
  const content = await newDocumentContent({
    templateKind,
    themeId: NEW_DOCUMENT_THEME_ID,
    tabId,
    via: 'workbench',
    // No template asked for: the editor opens on its start, where the templates are.
    templateChosen: templateKind !== null,
  });
  // Always LiveDoc: a workbench session is a server session (lib/new-document/write-new-document.ts).
  await writeNewDocument({
    ids: { documentId, tabId },
    name: untitledNameForTemplate(templateKind),
    templateKind,
    content,
    location: 'livedoc',
    creator: async () => ({ id: ownerId, name: '', color: '' }),
    teamId: request.teamId,
    folderId: request.folderId,
  });
  return documentId;
}
