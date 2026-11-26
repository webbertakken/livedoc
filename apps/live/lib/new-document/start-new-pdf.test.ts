// @vitest-environment jsdom
// docs/specs/013-workspace/new-document-menu.md "The blanks" and 035 starting-and-finding.md "Starting one": PDF
// document makes a Blank PDF, or opens a chosen file, stored as a dropped PDF is, then opens it; a chooser left makes
// nothing; a refusal is said; with nobody to make it, /new makes it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  pick: vi.fn(async (): Promise<File | null> => null),
  open: vi.fn(async () => ({ ok: true, documentId: 'd1', held: false }) as unknown),
  track: vi.fn(),
}));
vi.mock('@/lib/app-location', () => ({ assignAppLocation: mocks.assign }));
vi.mock('@/lib/pick-file', () => ({ pickFile: mocks.pick }));
vi.mock('@/lib/pdf-document/open-pdf-file', async (actual) => ({
  ...(await actual<typeof import('@/lib/pdf-document/open-pdf-file')>()),
  openPdfFile: mocks.open,
}));
vi.mock('@/lib/telemetry', () => ({ track: mocks.track }));
vi.mock('@/lib/auth-config', () => ({ signInOfferedHere: () => false }));

import { startNewPdf } from './start-new-pdf';
import { bindNewDocumentCreator } from './new-document-creator';

let unbind = () => {};
beforeEach(() => {
  unbind = bindNewDocumentCreator({ ownerId: 'owner-1', signedIn: true });
});
afterEach(() => {
  unbind();
  vi.clearAllMocks();
});

describe('startNewPdf', () => {
  it('stores a Blank PDF in the place and opens it', async () => {
    const say = vi.fn();
    await startNewPdf({ source: 'blank', place: { folderId: 'f1' }, say });
    const [owner, file, folder, where] = mocks.open.mock.calls[0] as unknown as [
      string,
      File,
      string,
      string,
    ];
    expect([owner, file.name, folder, where]).toEqual([
      'owner-1',
      'Untitled PDF.pdf',
      'f1',
      'livedoc',
    ]);
    expect(mocks.assign).toHaveBeenCalledWith('/document/d1');
    expect(mocks.track).toHaveBeenCalledWith('Document', 'Created', 'PdfBlank');
    expect(say).not.toHaveBeenCalled();
  });

  it('opens a chosen file, and makes nothing when the chooser is left', async () => {
    const chosen = new File(['%PDF-1.7'], 'Report.pdf', { type: 'application/pdf' });
    mocks.pick.mockResolvedValueOnce(chosen);
    await startNewPdf({ source: 'file', place: {}, say: vi.fn() });
    expect((mocks.open.mock.calls[0] as unknown as [string, File])[1]).toBe(chosen);
    expect(mocks.track).toHaveBeenCalledWith('Pdf', 'Imported', 'NewDocument');
    mocks.open.mockClear();
    mocks.assign.mockClear();
    await startNewPdf({ source: 'file', place: {}, say: vi.fn() });
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('says a refusal and opens nothing', async () => {
    mocks.open.mockResolvedValueOnce({ ok: false, refusal: 'usage_exceeded' });
    const say = vi.fn();
    await startNewPdf({ source: 'blank', place: {}, say });
    expect(say).toHaveBeenCalledWith("This file doesn't fit in the file storage that is left.");
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('says a failure to store it', async () => {
    mocks.open.mockRejectedValueOnce(new Error('offline'));
    const say = vi.fn();
    await startNewPdf({ source: 'blank', place: {}, say });
    expect(say).toHaveBeenCalledWith("This PDF couldn't be made. Try again.");
  });

  it('sends a Blank PDF to /new when nobody is bound to make it', async () => {
    unbind();
    await startNewPdf({ source: 'blank', place: { teamId: 't1' }, say: vi.fn() });
    expect(mocks.assign).toHaveBeenCalledWith('/new?kind=pdf-document&team=t1');
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
