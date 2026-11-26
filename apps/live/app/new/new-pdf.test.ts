// @vitest-environment jsdom
// docs/specs/007-editor/new-document-route.md "Choosing a mode": PDF document's card makes a Blank PDF, its second
// button opens a chosen file; stored, then opened; a refusal is the error card's, its Try Again making it again.
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pick: vi.fn(async (): Promise<File | null> => null),
  open: vi.fn(async () => ({ ok: true, documentId: 'd1', held: false }) as unknown),
  track: vi.fn(),
}));
vi.mock('@/lib/pick-file', () => ({ pickFile: mocks.pick }));
vi.mock('@/lib/pdf-document/open-pdf-file', async (actual) => ({
  ...(await actual<typeof import('@/lib/pdf-document/open-pdf-file')>()),
  openPdfFile: mocks.open,
}));
vi.mock('@/lib/telemetry', () => ({ track: mocks.track }));

import { makeNewPdf } from './new-pdf';

afterEach(() => vi.clearAllMocks());

const deps = () => ({
  search: '?folder=f1',
  ownerId: async () => 'owner-1',
  location: async () => ({ ok: true as const, value: 'livedoc' as const }),
  go: vi.fn(),
  fail: vi.fn(),
});

describe('makeNewPdf', () => {
  it('stores a Blank PDF in the asked folder and goes to it', async () => {
    const d = deps();
    await makeNewPdf('blank', d);
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
    expect(d.go).toHaveBeenCalledWith('/document/d1');
    expect(mocks.track).toHaveBeenCalledWith('Document', 'Created', 'PdfBlank');
  });

  it('opens a chosen file, and does nothing when the chooser is left', async () => {
    const d = deps();
    await makeNewPdf('file', d);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(d.go).not.toHaveBeenCalled();
    mocks.pick.mockResolvedValueOnce(new File(['%PDF'], 'Report.pdf'));
    await makeNewPdf('file', d);
    expect(d.go).toHaveBeenCalledWith('/document/d1');
  });

  it('hands a refusal or a failure to the error card', async () => {
    const d = deps();
    mocks.open.mockResolvedValueOnce({ ok: false, refusal: 'files_unavailable' });
    await makeNewPdf('blank', d);
    expect(d.fail).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'retry', message: 'This server has no file storage.' }),
    );
    mocks.open.mockRejectedValueOnce(new Error('offline'));
    await makeNewPdf('blank', d);
    expect(d.fail).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "This PDF couldn't be made. Try again." }),
    );
    expect(d.go).not.toHaveBeenCalled();
  });
});
