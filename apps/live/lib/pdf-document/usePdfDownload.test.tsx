// @vitest-environment jsdom
// docs/specs/035-pdf-documents/files-print-and-sync.md "Downloading": Download saves the bake, or the stored file
// itself where nobody changed it, under the document's name; a bake that cannot be made is said, and counted nowhere.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { downloadBlob } from '@/lib/download-blob';
import { track } from '@/lib/telemetry';
import { BAKE_FAILED_COPY, FACES_FAILED_COPY } from './download-pdf';
import { usePdfDownload } from './usePdfDownload';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/download-blob', () => ({ downloadBlob: vi.fn() }));

const STORED = Uint8Array.of(37, 80, 68, 70);

const changed = () => {
  const doc = PdfLiveChanges.load();
  doc.getMap('pages').set('changed', true);
  return doc;
};

function downloading(
  readStored: (() => Promise<Uint8Array<ArrayBuffer>>) | null = async () => STORED,
  engine = null as Parameters<typeof usePdfDownload>[0]['engine'],
  doc = PdfLiveChanges.load(),
) {
  const onProblem = vi.fn();
  const { result } = renderHook(() =>
    usePdfDownload({ engine, doc, documentName: 'Lease', readStored, onProblem }),
  );
  return { run: () => act(() => result.current()), onProblem };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePdfDownload', () => {
  it('saves the stored file itself, under the document’s name, where nobody changed it', async () => {
    const { run, onProblem } = downloading();
    await run();
    expect(onProblem).toHaveBeenCalledWith(null);
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]!;
    expect(name).toBe('Lease.pdf');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(STORED);
    expect(track).toHaveBeenCalledWith('Pdf', 'Exported', 'Pdf');
  });

  it('says a bake that cannot be made, or a file that cannot be read', async () => {
    // A change to bake: with no engine, or one that refuses, nothing is saved.
    for (const engine of [
      null,
      { bake: async () => ({ ok: false as const, refusal: 'reopen' as const }) },
    ]) {
      const refused = downloading(async () => STORED, engine, changed());
      await refused.run();
      expect(refused.onProblem).toHaveBeenLastCalledWith(BAKE_FAILED_COPY);
    }
    // marks.md "Loading": a mark's face that did not load is said by name.
    const faceless = downloading(
      async () => STORED,
      { bake: async () => ({ ok: false as const, refusal: 'faces-unavailable' as const }) },
      changed(),
    );
    await faceless.run();
    expect(faceless.onProblem).toHaveBeenLastCalledWith(FACES_FAILED_COPY);
    const unread = downloading(async () => {
      throw new Error('gone');
    });
    await unread.run();
    expect(unread.onProblem).toHaveBeenLastCalledWith(BAKE_FAILED_COPY);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('does nothing without a stored file', async () => {
    const { run, onProblem } = downloading(null);
    await run();
    expect(onProblem).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
