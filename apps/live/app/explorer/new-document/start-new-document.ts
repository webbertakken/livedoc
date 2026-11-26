// The one way the New Document menu makes a document (docs/specs/013-workspace/new-document-menu.md "What each choice
// does", "Opening at once"). A blank opens with its start closed, a template on the template.
// The document is made in the browser and opened in the Explorer's place at once; its create runs behind it
// (pending-documents.ts).
import {
  isBlankTemplate,
  newDocumentBlankOf,
  untitledNameForTemplate,
  type NewDocumentBlankId,
  type NewDocumentKind,
  type TemplateKind,
} from '@livedoc/templates';
import { startNewPdf } from '@/lib/new-document/start-new-pdf';
import { apiLoadSelf } from '@/lib/api-client';
import { assignAppLocation, interceptAppNavigation } from '@/lib/app-location';
import { debugLog } from '@/lib/debug-log';
import { loadEditorPage } from '@/lib/editor-page-loader';
import { loadCanvasCode } from '@/lib/canvas-code/canvas-code';
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
import { loadNewDocumentContent } from '@/lib/new-document/new-document-content-loader';
import { newDocumentLocationFor } from '@/lib/new-document/new-document-location';
import { NEW_DOCUMENT_THEME_ID } from '@/lib/new-document/new-document-theme';
import { trackNewDocumentCreated, writeNewDocument } from '@/lib/new-document/write-new-document';
import type { NewDocumentContent } from '@/lib/new-document-content';
import { textDocumentContent } from '@/lib/text-document/text-document-content';
import { noteTextDocumentMade } from '@/lib/text-document/text-document-made';
import { UNTITLED_TEXT_DOCUMENT } from '@/lib/text-document/text-document-tab';
import { UNTITLED_SPREADSHEET } from '@/lib/spreadsheet/spreadsheet-name';
import { handTemplatePick } from '@/lib/placement-defaults/template-pick-handoff';
import { isOfflineLocation, type SaveLocationId } from '@/lib/save-locations';
import {
  openInPlace,
  setStandbyInPlace,
} from '@/app/explorer/in-place-editor/in-place-editor-store';

// 'file': PDF document's Open a PDF file (new-document-menu.md "The blanks").
export type NewDocumentChoice = 'blank' | 'template' | 'file';

export type NewDocumentRequest = {
  choice: NewDocumentChoice;
  blank: NewDocumentBlankId;
  // The blank's own for 'blank', the card's for 'template'.
  template: TemplateKind;
  // The section's place; absent is no choice, where a default folder may answer.
  place: NewDocumentPlace;
  // Says what went wrong where a document cannot open at once (a PDF's file refused), as a toast does.
  say?: (message: string) => void;
};

// The /new address for the same request: the way when the document cannot open here, and a workspace frame's own.
export function newDocumentHref(request: NewDocumentRequest): string {
  const params = new URLSearchParams();
  const kind = newDocumentBlankOf(request.blank)?.kind;
  if (kind) params.set('kind', kind);
  else params.set('template', request.template);
  if (request.place.folderId) params.set('folder', request.place.folderId);
  if (request.place.teamId) params.set('team', request.place.teamId);
  return `/new?${params.toString()}`;
}

// What a new document opens with: the editor's code, the canvas's (docs/specs/006-document/kinds-outside-the-canvas.md
// "The canvas's code"), what builds its content, a Plan template's example cards, and the icon catalogues the editor
// draws with. The standby is rendered hidden, which runs none of its effects, so a load
// an effect starts in the editor (useIconCatalogs) would otherwise only begin at the click.
const OPEN_CODE = [
  loadEditorPage,
  () => loadCanvasCode('idle'),
  loadNewDocumentContent,
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
  // A PDF document is a stored file before it opens, blank or chosen (new-document-menu.md "Opening at once").
  if (newDocumentBlankOf(blank)?.kind === 'pdf-document') {
    void startNewPdf({
      source: choice === 'file' ? 'file' : 'blank',
      place: request.place,
      say: request.say ?? ((message) => console.warn('[new-document] pdf', message)),
    });
    return;
  }
  const creator = newDocumentCreator();
  if (!creator) {
    debugLog('[new-document] no-creator');
    assignAppLocation(newDocumentHref(request));
    return;
  }
  starting = true;
  const startedAt = performance.now();
  // A click that beat the idle fetch and never crossed the button asks for every piece at once, rather than waiting
  // on what builds the content and then on the editor.
  prefetchNewDocumentOpen();
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
  /** The document kind it is, for a kind's blank. */
  kind?: NewDocumentKind | null;
};

async function prepareDocument(
  template: TemplateKind,
  choice: NewDocumentChoice,
  creator: NewDocumentCreator,
  location: SaveLocationId,
  kind: NewDocumentKind | null = null,
): Promise<PreparedDocument> {
  const ids = createIdsFor(null);
  // A text document or a spreadsheet: one empty tab of its kind, as /new?kind= makes (new-document-menu.md).
  if (kind === 'text-document' || kind === 'spreadsheet') {
    const made = await kindDocumentContent(kind, ids.tabId);
    return { ids, template, choice, ...made, location, ownerId: creator.ownerId, kind };
  }
  const { newDocumentContent } = await loadNewDocumentContent();
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

// A kind's empty document and its name; what builds a spreadsheet's loads only for one.
async function kindDocumentContent(
  kind: 'text-document' | 'spreadsheet',
  tabId: string,
): Promise<{ name: string; content: NewDocumentContent }> {
  if (kind === 'text-document') {
    return {
      name: UNTITLED_TEXT_DOCUMENT,
      content: textDocumentContent(tabId, UNTITLED_TEXT_DOCUMENT),
    };
  }
  const { spreadsheetDocumentContent } = await import('@/lib/spreadsheet/spreadsheet-document');
  return { name: UNTITLED_SPREADSHEET, content: spreadsheetDocumentContent(tabId) };
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
  const location = newDocumentLocationFor({}, creator);
  if (
    standby &&
    standby.template === blank.blank &&
    (standby.kind ?? null) === (blank.kind ?? null) &&
    standby.ownerId === creator.ownerId &&
    standby.location === location
  )
    return;
  preparing = true;
  try {
    await loadEditorPage();
    if (blank.kind === 'pdf-document') return;
    setStandby(await prepareDocument(blank.blank, 'blank', creator, location, blank.kind));
    debugLog(`[new-document] standby blank=${blank.id}`);
  } catch (error) {
    // Background work (docs/specs/016-platform/stale-builds.md "Background work"): its code gone after a deploy, or
    // the network down, is no failure of the page the person is on. Left unmade; the click makes the document fresh,
    // and that load recovers as any navigation does.
    console.warn('[new-document] standby not made', { error: String(error) });
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
    (taken.kind ?? null) !== (newDocumentBlankOf(request.blank)?.kind ?? null) ||
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
  const location = newDocumentLocationFor(place, creator);
  const fromStandby = takeStandby(request, creator, location);
  debugLog(`[new-document] standby=${fromStandby ? 'used' : 'none'}`);
  const kind = newDocumentBlankOf(request.blank)?.kind ?? null;
  const doc = fromStandby ?? (await prepareDocument(template, choice, creator, location, kind));
  const { ids, name, content } = doc;
  const { documentId, tabId } = ids;
  const offline = isOfflineLocation(location);
  // A mode's blank in the cloud: a template picked on its start may move it to that template's default folder
  // (docs/specs/013-workspace/default-folders.md "A template picked after creation").
  handTemplatePick(
    !offline && !kind && isBlankTemplate(template)
      ? { documentId, tabId, placementChosen: !!(place.folderId || place.teamId) }
      : null,
  );
  // A text document made here starts in its maker's default styles when it first opens (text-and-paragraphs.md).
  if (doc.kind === 'text-document') noteTextDocumentMade(tabId);
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
