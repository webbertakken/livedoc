// The one way the New Document menu makes a document (docs/specs/013-workspace/new-document-menu.md "What each choice
// does", "Opening at once"). A blank opens with its start closed, a template on the template.
// The document is made in the browser and opened in the Explorer's place at once; its create runs behind it
// (pending-documents.ts).
import {
  isBlankTemplate,
  newDocumentBlankOf,
  untitledNameForTemplate,
  type NewDocumentBlankId,
  type TemplateKind,
} from '@livedoc/templates';
import { apiLoadSelf } from '@/lib/api-client';
import { assignAppLocation, interceptAppNavigation } from '@/lib/app-location';
import { signInOfferedHere } from '@/lib/auth-config';
import { debugLog } from '@/lib/debug-log';
import { loadEditorPage } from '@/lib/editor-page-loader';
import { ensureIconCatalogs } from '@/lib/icon-registry';
import { prefetchWhenIdle } from '@/lib/idle-prefetch';
import { markNameConfirmed } from '@/lib/local-identity';
import { createIdsFor, type CreateIds } from '@/lib/new-document/create-failure';
import {
  newDocumentCreator,
  type NewDocumentCreator,
} from '@/lib/new-document/new-document-creator';
import {
  addPendingDocument,
  addStandbyDocument,
  dropStandbyDocument,
  type NewDocumentPlace,
} from '@/lib/new-document/pending-documents';
import { trackNewDocumentCreated, writeNewDocument } from '@/lib/new-document/write-new-document';
import {
  NEW_DOCUMENT_THEME_ID,
  newDocumentContent,
  type NewDocumentContent,
} from '@/lib/new-document-content';
import { handTemplatePick } from '@/lib/placement-defaults/template-pick-handoff';
import {
  defaultSaveLocationFor,
  isOfflineLocation,
  type SaveLocationId,
} from '@/lib/save-locations';
import { closeStartForBlank } from '@/components/start/close-start-for-blank';
import {
  openInPlace,
  setStandbyInPlace,
} from '@/app/explorer/in-place-editor/in-place-editor-store';

export type NewDocumentChoice = 'blank' | 'template';

export type NewDocumentRequest = {
  choice: NewDocumentChoice;
  blank: NewDocumentBlankId;
  // The blank's own for 'blank', the card's for 'template'.
  template: TemplateKind;
  // The section's place; absent is no choice, where a default folder may answer.
  place: NewDocumentPlace;
};

// The /new address for the same request: the way when the document cannot open here, and a workspace frame's own.
export function newDocumentHref(request: NewDocumentRequest): string {
  const params = new URLSearchParams();
  params.set('template', request.template);
  if (request.place.folderId) params.set('folder', request.place.folderId);
  if (request.place.teamId) params.set('team', request.place.teamId);
  return `/new?${params.toString()}`;
}

// Where a new document is stored: LiveDoc when placed, else the default for who is creating
// (docs/specs/006-document/save-locations.md "The default depends on who is creating").
function locationFor(place: NewDocumentPlace, creator: NewDocumentCreator): SaveLocationId {
  if (place.folderId || place.teamId) return 'livedoc';
  return defaultSaveLocationFor({
    signedIn: creator.signedIn,
    signInOffered: signInOfferedHere() === true,
  });
}

// What a new document opens with: the editor's code, a Plan template's example cards, and the icon catalogues the
// editor draws with. The standby is rendered hidden, which runs none of its effects, so a load an effect starts in the
// editor (useIconCatalogs) would otherwise only begin at the click.
const OPEN_CODE = [
  loadEditorPage,
  () => import('@livedoc/templates/plan-template-seeds'),
  ensureIconCatalogs,
] as const;

// Fetches what opening needs ahead of the click: on idle, and on pointer enter or focus of the button.
export function prefetchNewDocumentOpen(): void {
  for (const load of OPEN_CODE) void load().catch(() => {});
}
export function prefetchNewDocumentOpenWhenIdle(): () => void {
  return prefetchWhenIdle(OPEN_CODE);
}

let starting = false;

export function startNewDocument(request: NewDocumentRequest): void {
  const { choice, blank, template } = request;
  debugLog(`[new-document] choice=${choice} blank=${blank} template=${template}`);
  if (starting) {
    debugLog('[new-document] busy');
    return;
  }
  // A workspace frame makes it its own way, in the frame (useWorkspaceNavigation).
  if (interceptAppNavigation(newDocumentHref(request), false)) return;
  const creator = newDocumentCreator();
  if (!creator) {
    debugLog('[new-document] no-creator');
    assignAppLocation(newDocumentHref(request));
    return;
  }
  starting = true;
  const startedAt = performance.now();
  openNewDocument(request, creator, startedAt)
    .catch((err: unknown) => {
      // Nothing was opened or registered: the /new path makes it instead.
      console.error('[new-document] open failed', err);
      assignAppLocation(newDocumentHref(request));
    })
    .finally(() => {
      starting = false;
    });
}

// A document made ready to open: its ids, its content and where it is stored. Made at the click, or ahead of it as the
// standby the Explorer renders hidden.
type PreparedDocument = {
  ids: CreateIds;
  template: TemplateKind;
  choice: NewDocumentChoice;
  name: string;
  content: NewDocumentContent;
  location: SaveLocationId;
  ownerId: string;
};

async function prepareDocument(
  template: TemplateKind,
  choice: NewDocumentChoice,
  creator: NewDocumentCreator,
  location: SaveLocationId,
): Promise<PreparedDocument> {
  const ids = createIdsFor(null);
  // A blank opens with its start closed (close-start-for-blank.ts).
  if (choice === 'blank') closeStartForBlank(ids.tabId, template);
  const content = await newDocumentContent({
    templateKind: template,
    themeId: NEW_DOCUMENT_THEME_ID,
    tabId: ids.tabId,
    via: 'explorer',
  });
  return {
    ids,
    template,
    choice,
    name: untitledNameForTemplate(template),
    content,
    location,
    ownerId: creator.ownerId,
  };
}

const inputOf = (doc: PreparedDocument, teamId: string | null, startedAt: number) => ({
  id: doc.ids.documentId,
  name: doc.name,
  tabs: doc.content.tabs ?? [doc.content.tab],
  itemTypes: doc.content.itemTypes,
  ownerId: doc.ownerId,
  location: doc.location,
  teamId,
  startedAt,
});

// The standby: the blank the face makes next, for this creator, stored where an unplaced document goes.
let standby: PreparedDocument | null = null;
let preparing = false;

function setStandby(next: PreparedDocument | null): void {
  if (standby) dropStandbyDocument(standby.ids.documentId);
  standby = next;
  if (next) addStandbyDocument(inputOf(next, null, 0));
  setStandbyInPlace(next?.ids.documentId ?? null);
}

// Makes the standby for the face's blank, once the editor's code is in and someone is bound to create it. Nothing is
// written anywhere: a standby never used costs only memory.
export async function prepareStandbyDocument(lastBlank: NewDocumentBlankId): Promise<void> {
  const creator = newDocumentCreator();
  const blank = newDocumentBlankOf(lastBlank);
  if (!creator || !blank || preparing) return;
  const location = locationFor({}, creator);
  if (
    standby &&
    standby.template === blank.blank &&
    standby.ownerId === creator.ownerId &&
    standby.location === location
  )
    return;
  preparing = true;
  try {
    await loadEditorPage();
    setStandby(await prepareDocument(blank.blank, 'blank', creator, location));
    debugLog(`[new-document] standby blank=${blank.id}`);
  } finally {
    preparing = false;
  }
}

// The standby, when it is what the request makes; it is the request's from then on.
function takeStandby(
  request: NewDocumentRequest,
  creator: NewDocumentCreator,
  location: SaveLocationId,
): PreparedDocument | null {
  const taken = standby;
  if (
    !taken ||
    taken.choice !== request.choice ||
    taken.template !== request.template ||
    taken.ownerId !== creator.ownerId ||
    taken.location !== location
  )
    return null;
  // Taken, not dropped: opening it in place (openInPlace) moves its editor from standby to open in one update.
  standby = null;
  dropStandbyDocument(taken.ids.documentId);
  return taken;
}

async function openNewDocument(
  request: NewDocumentRequest,
  creator: NewDocumentCreator,
  startedAt: number,
): Promise<void> {
  const { choice, template, place } = request;
  const location = locationFor(place, creator);
  const fromStandby = takeStandby(request, creator, location);
  debugLog(`[new-document] standby=${fromStandby ? 'used' : 'none'}`);
  const doc = fromStandby ?? (await prepareDocument(template, choice, creator, location));
  const { ids, name, content } = doc;
  const { documentId, tabId } = ids;
  const offline = isOfflineLocation(location);
  // A mode's blank in the cloud: a template picked on its start may move it to that template's default folder
  // (docs/specs/013-workspace/default-folders.md "A template picked after creation").
  handTemplatePick(
    !offline && isBlankTemplate(template)
      ? { documentId, tabId, placementChosen: !!(place.folderId || place.teamId) }
      : null,
  );
  // Whoever is making a document has their name; the join prompt is for someone arriving at another's.
  markNameConfirmed();
  await loadEditorPage();
  // A LiveDoc create needs only its owner's id; This Browser's example cards are signed by the person, if known.
  const author = async () =>
    offline
      ? ((await apiLoadSelf(creator.ownerId).catch(() => null)) ?? {
          id: 'pending',
          name: '',
          color: '',
        })
      : { id: creator.ownerId, name: '', color: '' };
  addPendingDocument(
    inputOf(doc, place.teamId ?? null, startedAt),
    async (at) => {
      await writeNewDocument({
        ids,
        name,
        templateKind: template,
        content,
        location,
        creator: author,
        teamId: at.teamId,
        folderId: at.folderId,
      });
      trackNewDocumentCreated({ location, templateKind: template, teamId: at.teamId });
    },
    place,
  );
  // A new entry, so Back returns to the Explorer where it was.
  window.history.pushState(null, '', `/document/${documentId}`);
  openInPlace(documentId);
}

export function resetNewDocumentStartForTests(): void {
  standby = null;
  preparing = false;
  starting = false;
}
