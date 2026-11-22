// @vitest-environment jsdom
// docs/specs/035-pdf-documents/pdf-document.md "A PDF tab from a file": the chooser, the word for a slow one, a
// refusal said, the stored tab landed and counted.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

const picked = vi.hoisted(() => ({ pickFile: vi.fn() }));
const flow = vi.hoisted(() => ({
  addPdfTab: vi.fn(),
  PDF_ARRIVAL_COPY: { not_a_pdf: 'Drop a PDF here to open it.' },
}));
vi.mock('@/lib/pick-file', () => picked);
vi.mock('./add-pdf-tab', () => flow);
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

import { track } from '@/lib/telemetry';
import {
  addPdfTabFromChooser,
  PDF_TAB_ACCEPT,
  PDF_TAB_FAILED,
  PDF_TAB_NOTICE_MS,
  PDF_TAB_UPLOADING,
} from './pdf-tab-from-file';

const FILE = new File(['%PDF-1.7'], 'Lease.pdf', { type: 'application/pdf' });
const TAB = {
  id: 'tab-9',
  name: 'Lease',
  kind: 'pdf',
  elements: [],
  blob: 'k',
  size: 8,
} as unknown as Tab;

function deps() {
  return {
    ownerId: 'ada',
    documentId: 'doc-1',
    shareCode: null,
    tabId: 'tab-9',
    toast: { info: vi.fn(), error: vi.fn() },
    land: vi.fn(),
  };
}

// A module's dynamic import runs off the fake clock: loaded once, before any test stops time.
beforeAll(async () => {
  await import('./add-pdf-tab');
});
beforeEach(() => {
  vi.useFakeTimers();
  picked.pickFile.mockReset().mockResolvedValue(FILE);
  flow.addPdfTab.mockReset().mockResolvedValue({ ok: true, tab: TAB, held: false });
  vi.mocked(track).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('addPdfTabFromChooser', () => {
  it('opens the chooser for a PDF, and lands and counts the tab the flow stored', async () => {
    const d = deps();
    await addPdfTabFromChooser(d);
    expect(picked.pickFile).toHaveBeenCalledWith(PDF_TAB_ACCEPT);
    expect(flow.addPdfTab).toHaveBeenCalledWith(d, FILE, 'tab-9');
    expect(d.land).toHaveBeenCalledWith(TAB);
    expect(vi.mocked(track).mock.calls).toEqual([
      ['Tab', 'Created', 'Pdf'],
      ['Pdf', 'Imported', 'Tab'],
    ]);
    expect(d.toast.error).not.toHaveBeenCalled();
  });

  it('adds nothing and says nothing when the chooser is left', async () => {
    picked.pickFile.mockResolvedValue(null);
    const d = deps();
    await addPdfTabFromChooser(d);
    await vi.advanceTimersByTimeAsync(PDF_TAB_NOTICE_MS * 2);
    expect(flow.addPdfTab).not.toHaveBeenCalled();
    expect(d.land).not.toHaveBeenCalled();
    expect(d.toast.info).not.toHaveBeenCalled();
    expect(d.toast.error).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('says a refusal in its own words, lands nothing and counts nothing', async () => {
    flow.addPdfTab.mockResolvedValue({ ok: false, refusal: 'not_a_pdf' });
    const d = deps();
    await addPdfTabFromChooser(d);
    expect(d.toast.error).toHaveBeenCalledWith('Drop a PDF here to open it.');
    expect(d.land).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('says nothing of a quick one, and never after it ended', async () => {
    const d = deps();
    await addPdfTabFromChooser(d);
    await vi.advanceTimersByTimeAsync(PDF_TAB_NOTICE_MS * 2);
    expect(d.toast.info).not.toHaveBeenCalled();
  });

  it('says a slow one is uploading, once, past the wait', async () => {
    let finish!: (added: unknown) => void;
    flow.addPdfTab.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const d = deps();
    const adding = addPdfTabFromChooser(d);
    await vi.advanceTimersByTimeAsync(PDF_TAB_NOTICE_MS - 1);
    expect(d.toast.info).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(d.toast.info).toHaveBeenCalledWith(PDF_TAB_UPLOADING);
    finish({ ok: true, tab: TAB, held: false });
    await adding;
    await vi.advanceTimersByTimeAsync(PDF_TAB_NOTICE_MS * 2);
    expect(d.toast.info).toHaveBeenCalledOnce();
    expect(d.land).toHaveBeenCalledWith(TAB);
  });

  it('says the PDF could not be added, by its fingerprint, when the file cannot be taken at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    flow.addPdfTab.mockRejectedValue(new Error('unreadable'));
    const d = deps();
    await addPdfTabFromChooser(d);
    expect(d.toast.error).toHaveBeenCalledWith(PDF_TAB_FAILED);
    expect(warn).toHaveBeenCalledWith('[pdf] add failed', 'Error: unreadable');
    expect(d.land).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PDF_TAB_NOTICE_MS * 2);
    expect(d.toast.info).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
