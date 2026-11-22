// @vitest-environment jsdom
// docs/specs/035-pdf-documents/files-print-and-sync.md "Opening": a PDF dropped on the Explorer opens as a PDF
// document in the folder in view, kept where a new document of that person is; a drop in the page's first moments
// waits for the Explorer to know who is here; a section that takes none says so; a refusal is said by name.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
  assign: vi.fn(),
  track: vi.fn(),
  signInOffered: vi.fn((): boolean | null => false),
  openPdfFile: vi.fn(),
}));
vi.mock('@/hooks/ui/useToast', () => ({ useToast: () => mocks.toast }));
vi.mock('@/lib/app-location', () => ({ assignAppLocation: mocks.assign }));
vi.mock('@/lib/telemetry', () => ({ track: mocks.track }));
vi.mock('@/lib/auth-config', () => ({ signInOfferedHere: mocks.signInOffered }));
vi.mock('@/lib/pdf-document/open-pdf-file', () => ({
  openPdfFile: mocks.openPdfFile,
  PDF_ARRIVAL_COPY: { not_a_pdf: 'Drop a PDF here to open it.' },
}));

import { bindNewDocumentCreator } from '@/lib/new-document/new-document-creator';
import {
  PDF_DROP_FAILED,
  PDF_DROP_NOT_HERE,
  PDF_DROP_NOT_READY,
  PDF_DROP_OWNER_WAIT_MS,
  useExplorerPdfDrop,
} from './useExplorerPdfDrop';

type Options = Parameters<typeof useExplorerPdfDrop>[0];
const created = vi.fn();
const file = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' });

function drag(type: 'dragover' | 'drop', files: File[], types = ['Files']): DragEvent {
  const event = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { files, types, dropEffect: 'none' } });
  window.dispatchEvent(event);
  return event;
}
const mount = (over: Partial<Options> = {}) => {
  const initialProps: Options = { ownerId: 'ada', place: {}, onDocumentsCreated: created, ...over };
  return renderHook((props: Options) => useExplorerPdfDrop(props), { initialProps });
};
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

let unbind = () => {};
// The code a first drop loads, loaded: a module's load is not on the fake clock.
beforeAll(async () => void (await import('@/lib/pdf-document/pdf-drop')));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.signInOffered.mockReturnValue(false);
  mocks.openPdfFile.mockImplementation(async (_owner: string, f: File) => ({
    ok: true,
    documentId: `doc-${f.name}`,
    held: false,
  }));
  unbind = bindNewDocumentCreator({ ownerId: 'ada', signedIn: false });
});
afterEach(() => {
  unbind();
  vi.useRealTimers();
});

describe('a PDF dropped on the Explorer', () => {
  it('opens as a PDF document in the folder in view, on LiveDoc where no sign-in is offered', async () => {
    mount({ place: { folderId: 'f1' } });
    const dropped = drag('drop', [file('Lease.pdf')]);
    expect(dropped.defaultPrevented).toBe(true);
    await settle();
    expect(mocks.openPdfFile).toHaveBeenCalledWith('ada', expect.any(File), 'f1', 'livedoc');
    expect(mocks.track).toHaveBeenCalledWith('Pdf', 'Imported', 'Explorer');
    expect(mocks.track).toHaveBeenCalledWith('Document', 'Created', 'Cloud');
    expect(created).toHaveBeenCalledOnce();
    expect(mocks.assign).toHaveBeenCalledWith('/document/doc-Lease.pdf');
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  // "This Browser for a guest where sign-in is offered, whose file is kept in this browser and sent nowhere"
  it('is kept in This Browser for a guest where sign-in is offered', async () => {
    mocks.signInOffered.mockReturnValue(true);
    mount();
    drag('drop', [file('Lease.pdf')]);
    await settle();
    expect(mocks.openPdfFile).toHaveBeenCalledWith('ada', expect.any(File), undefined, 'browser');
    expect(mocks.track).toHaveBeenCalledWith('Document', 'Created', 'Offline');
  });

  it('goes to LiveDoc for a signed-in person, and for a drop on a folder whoever drops it', async () => {
    mocks.signInOffered.mockReturnValue(true);
    unbind();
    unbind = bindNewDocumentCreator({ ownerId: 'ada', signedIn: true });
    const signedIn = mount();
    drag('drop', [file('a.pdf')]);
    await settle();
    expect(mocks.openPdfFile).toHaveBeenLastCalledWith(
      'ada',
      expect.any(File),
      undefined,
      'livedoc',
    );
    signedIn.unmount();
    unbind();
    unbind = bindNewDocumentCreator({ ownerId: 'ada', signedIn: false });
    mount({ place: { folderId: 'f1' } });
    drag('drop', [file('b.pdf')]);
    await settle();
    expect(mocks.openPdfFile).toHaveBeenLastCalledWith('ada', expect.any(File), 'f1', 'livedoc');
  });

  it('takes whoever drops before the Explorer has settled them as a guest', async () => {
    mocks.signInOffered.mockReturnValue(true);
    unbind();
    mount();
    drag('drop', [file('a.pdf')]);
    await settle();
    expect(mocks.openPdfFile).toHaveBeenCalledWith('ada', expect.any(File), undefined, 'browser');
  });

  // "A drop in the page's first moments waits for the Explorer to know who is here"
  it('waits for the Explorer to know who is here, then opens the file', async () => {
    const hook = mount({ ownerId: null });
    drag('drop', [file('early.pdf')]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(mocks.openPdfFile).not.toHaveBeenCalled();
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    hook.rerender({ ownerId: 'ada', place: {}, onDocumentsCreated: created });
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    expect(mocks.openPdfFile).toHaveBeenCalledWith('ada', expect.any(File), undefined, 'livedoc');
    expect(mocks.assign).toHaveBeenCalledWith('/document/doc-early.pdf');
  });

  it('says so when the Explorer never learns who is here, and makes nothing', async () => {
    mount({ ownerId: null });
    drag('drop', [file('early.pdf')]);
    await act(async () => void (await vi.advanceTimersByTimeAsync(PDF_DROP_OWNER_WAIT_MS + 100)));
    expect(mocks.toast.warning).toHaveBeenCalledWith(PDF_DROP_NOT_READY);
    expect(mocks.openPdfFile).not.toHaveBeenCalled();
  });

  it('opens nothing for a page that was left while it waited', async () => {
    const hook = mount({ ownerId: null });
    drag('drop', [file('early.pdf')]);
    hook.unmount();
    await act(async () => void (await vi.advanceTimersByTimeAsync(PDF_DROP_OWNER_WAIT_MS + 100)));
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    expect(mocks.openPdfFile).not.toHaveBeenCalled();
  });

  it('says at once where a section takes no document, and when it stops taking any while a drop waits', async () => {
    mount({ place: undefined });
    drag('drop', [file('a.pdf')]);
    await settle();
    expect(mocks.toast.warning).toHaveBeenCalledWith(PDF_DROP_NOT_HERE);
    expect(mocks.openPdfFile).not.toHaveBeenCalled();
    mocks.toast.warning.mockClear();
    const hook = mount({ ownerId: null });
    drag('drop', [file('b.pdf')]);
    hook.rerender({ ownerId: 'ada', place: undefined, onDocumentsCreated: created });
    await act(async () => void (await vi.advanceTimersByTimeAsync(100)));
    expect(mocks.toast.warning).toHaveBeenCalledWith(PDF_DROP_NOT_HERE);
  });

  // "Several PDFs dropped together open as several documents, with one toast ("4 PDFs added") and the first opened."
  it('opens several as several documents, says how many, and opens the first', async () => {
    mount();
    drag('drop', [file('a.pdf'), file('b.pdf')]);
    await settle();
    expect(mocks.toast.success).toHaveBeenCalledWith('2 PDFs added');
    expect(mocks.track.mock.calls.filter(([category]) => category === 'Pdf')).toHaveLength(2);
    expect(mocks.assign).toHaveBeenCalledWith('/document/doc-a.pdf');
  });

  it('says a refusal by name and goes nowhere when nothing was made', async () => {
    mocks.openPdfFile.mockResolvedValue({ ok: false, refusal: 'not_a_pdf' });
    mount();
    drag('drop', [file('words.txt')]);
    await settle();
    expect(mocks.toast.error).toHaveBeenCalledWith('Drop a PDF here to open it.');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
  });

  it('says so when the file could not be taken at all', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.openPdfFile.mockRejectedValue(new Error('the chunk did not load'));
    mount();
    drag('drop', [file('a.pdf')]);
    await settle();
    expect(mocks.toast.error).toHaveBeenCalledWith(PDF_DROP_FAILED);
  });

  // "the drop is never taken silently by the browser (which would replace LiveDoc with the browser's own viewer)"
  it('takes a file dragged over the page, and leaves any other drag alone', () => {
    mount();
    expect(drag('dragover', [], ['Files']).defaultPrevented).toBe(true);
    expect(drag('dragover', [], ['text/plain']).defaultPrevented).toBe(false);
    expect(drag('drop', [], ['text/plain']).defaultPrevented).toBe(false);
    const bare = new Event('dragover', { cancelable: true });
    window.dispatchEvent(bare);
    expect(bare.defaultPrevented).toBe(false);
    window.dispatchEvent(new Event('drop', { cancelable: true }));
    expect(mocks.openPdfFile).not.toHaveBeenCalled();
  });
});
