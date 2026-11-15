// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  intercept: vi.fn(() => false),
  signInOffered: vi.fn((): boolean | null => true),
  write: vi.fn(async () => {}),
  track: vi.fn(),
  closeStart: vi.fn(),
  openInPlace: vi.fn(),
  setStandbyInPlace: vi.fn(),
  loadEditor: vi.fn(async () => () => null),
  loadPlanSeeds: vi.fn(async () => ({})),
  ensureIconCatalogs: vi.fn(async () => {}),
}));
vi.mock('@/lib/app-location', () => ({
  assignAppLocation: mocks.assign,
  interceptAppNavigation: mocks.intercept,
}));
vi.mock('@/lib/auth-config', () => ({ signInOfferedHere: mocks.signInOffered }));
vi.mock('@/lib/new-document/write-new-document', () => ({
  writeNewDocument: mocks.write,
  trackNewDocumentCreated: mocks.track,
}));
vi.mock('@/components/start/close-start-for-blank', () => ({
  closeStartForBlank: mocks.closeStart,
}));
vi.mock('@/app/explorer/in-place-editor/in-place-editor-store', () => ({
  openInPlace: mocks.openInPlace,
  setStandbyInPlace: mocks.setStandbyInPlace,
}));
vi.mock('@/lib/editor-page-loader', () => ({ loadEditorPage: mocks.loadEditor }));
vi.mock('@livedoc/templates/plan-template-seeds', () => mocks.loadPlanSeeds());
vi.mock('@/lib/icon-registry', () => ({ ensureIconCatalogs: mocks.ensureIconCatalogs }));
vi.mock('@/lib/api-client', () => ({
  apiLoadSelf: vi.fn(async () => null),
  ApiError: class ApiError extends Error {},
}));

import {
  newDocumentHref,
  prefetchNewDocumentOpen,
  prepareStandbyDocument,
  resetNewDocumentStartForTests,
  startNewDocument,
  type NewDocumentRequest,
} from './start-new-document';
import { bindNewDocumentCreator } from '@/lib/new-document/new-document-creator';
import {
  notePendingPainted,
  pendingDocument,
  resetPendingDocumentsForTests,
  standbyDocument,
} from '@/lib/new-document/pending-documents';
import { resetCreateHoldsForTests } from '@/lib/new-document/create-hold';

const request = (over: Partial<NewDocumentRequest> = {}): NewDocumentRequest => ({
  choice: 'blank',
  blank: 'diagram',
  template: 'blank',
  place: {},
  ...over,
});

// Until the open has happened: the address moved to the new document.
// The editor paints it at once in the app; here nothing renders, so the test says it has (notePendingPainted).
const opened = async () => {
  await vi.waitFor(() => expect(window.location.pathname).toMatch(/^\/document\/[0-9a-f-]{36}$/));
  notePendingPainted(window.location.pathname.split('/').pop()!);
  await new Promise((r) => setTimeout(r, 0));
};
const openedId = () => window.location.pathname.split('/').pop()!;

let unbind: () => void = () => {};
beforeEach(() => {
  window.history.replaceState(null, '', '/explorer/home');
  unbind = bindNewDocumentCreator({ ownerId: 'owner-1', signedIn: false });
});
afterEach(async () => {
  // Let a start in flight finish, so the busy guard is clear for the next test.
  await new Promise((r) => setTimeout(r, 0));
  unbind();
  resetNewDocumentStartForTests();
  resetPendingDocumentsForTests();
  resetCreateHoldsForTests();
  vi.clearAllMocks();
});

describe('startNewDocument', () => {
  it('opens a blank in place at once, its start closed, a new history entry', async () => {
    const before = window.history.length;
    startNewDocument(request());
    await opened();
    const id = openedId();
    expect(window.history.length).toBe(before + 1);
    expect(mocks.openInPlace).toHaveBeenCalledWith(id);
    expect(mocks.closeStart).toHaveBeenCalledWith(expect.any(String), 'blank');
    const doc = pendingDocument(id)!;
    expect(doc.name).toBe('Untitled document');
    expect(doc.tabs).toHaveLength(1);
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('makes a guest’s document in This Browser where sign-in is offered', async () => {
    startNewDocument(request());
    await opened();
    expect(pendingDocument(openedId())!.location).toBe('browser');
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ location: 'browser' }));
  });

  it('makes a placed document LiveDoc’s, with its place, and counts it once it lands', async () => {
    startNewDocument(request({ place: { folderId: 'f1' } }));
    await opened();
    expect(mocks.write).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'livedoc', folderId: 'f1', teamId: undefined }),
    );
    await vi.waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith({
        location: 'livedoc',
        templateKind: 'blank',
        teamId: undefined,
      }),
    );
  });

  it('leaves a template’s start alone', async () => {
    startNewDocument(request({ choice: 'template', template: 'flowchart' }));
    await opened();
    expect(mocks.closeStart).not.toHaveBeenCalled();
  });

  it('makes one document for a double click', async () => {
    startNewDocument(request());
    startNewDocument(request());
    await opened();
    expect(mocks.openInPlace).toHaveBeenCalledTimes(1);
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });

  it('retries under the same ids', async () => {
    mocks.write.mockRejectedValueOnce(new Error('network'));
    startNewDocument(request({ place: { teamId: 't1' } }));
    await opened();
    const id = openedId();
    await vi.waitFor(() => expect(pendingDocument(id)!.create.status).toBe('failed'));
    const { retryPendingDocument } = await import('@/lib/new-document/pending-documents');
    retryPendingDocument(id, { withoutPlacement: false });
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
    const [first, second] = mocks.write.mock.calls as unknown as [
      [{ ids: object; teamId?: string }],
      [{ ids: object; teamId?: string }],
    ];
    expect(second[0].ids).toEqual(first[0].ids);
    expect(second[0].teamId).toBe('t1');
  });

  it('leaves a workspace frame to make it its own way', () => {
    mocks.intercept.mockReturnValueOnce(true);
    startNewDocument(request({ place: { folderId: 'f1' } }));
    expect(mocks.intercept).toHaveBeenCalledWith('/new?template=blank&folder=f1', false);
    expect(mocks.openInPlace).not.toHaveBeenCalled();
  });

  it('takes the /new path when nobody is bound as the creator', () => {
    unbind();
    startNewDocument(request({ choice: 'template', template: 'kanban', place: { teamId: 't1' } }));
    expect(mocks.assign).toHaveBeenCalledWith('/new?template=kanban&team=t1');
    expect(mocks.openInPlace).not.toHaveBeenCalled();
  });
});

describe('the standby', () => {
  it('is made ahead for the face’s blank, its start closed, and nothing is created', async () => {
    await prepareStandbyDocument('diagram');
    const [id] = mocks.setStandbyInPlace.mock.calls.at(-1) as [string];
    expect(standbyDocument(id)?.name).toBe('Untitled document');
    expect(mocks.closeStart).toHaveBeenCalledWith(expect.any(String), 'blank');
    expect(mocks.write).not.toHaveBeenCalled();
    expect(pendingDocument(id)).toBeNull();
  });

  it('is what the face’s click opens, under the same id, created only then', async () => {
    await prepareStandbyDocument('diagram');
    const [id] = mocks.setStandbyInPlace.mock.calls.at(-1) as [string];
    startNewDocument(request());
    await opened();
    expect(openedId()).toBe(id);
    expect(mocks.openInPlace).toHaveBeenCalledWith(id);
    expect(pendingDocument(id)?.create.status).toBeDefined();
    expect(standbyDocument(id)).toBeNull();
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it('is left for another choice, which is made fresh', async () => {
    await prepareStandbyDocument('diagram');
    const [id] = mocks.setStandbyInPlace.mock.calls.at(-1) as [string];
    startNewDocument(request({ choice: 'template', template: 'flowchart' }));
    await opened();
    expect(openedId()).not.toBe(id);
    expect(standbyDocument(id)).not.toBeNull();
  });
});

describe('prefetchNewDocumentOpen', () => {
  // The hidden standby runs no effects, so a load an effect would start (the icon catalogues) has to come in here.
  it('fetches the editor and the icon catalogues the editor draws with', () => {
    prefetchNewDocumentOpen();
    expect(mocks.loadEditor).toHaveBeenCalledOnce();
    expect(mocks.ensureIconCatalogs).toHaveBeenCalledOnce();
  });
});

describe('a click before anything was fetched ahead', () => {
  // What builds the content and the editor's code are separate pieces: fetched one after the other, the click
  // would wait on both in turn.
  it('asks for everything opening needs at once, before it waits on any of it', () => {
    startNewDocument(request({ choice: 'template', template: 'flowchart' }));
    expect(mocks.loadEditor).toHaveBeenCalledOnce();
    expect(mocks.ensureIconCatalogs).toHaveBeenCalledOnce();
  });
});

describe('newDocumentHref', () => {
  it('names the template and the place', () => {
    expect(newDocumentHref(request({ place: { folderId: 'f1' } }))).toBe(
      '/new?template=blank&folder=f1',
    );
  });
});
