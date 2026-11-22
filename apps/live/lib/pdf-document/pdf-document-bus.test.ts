// docs/specs/035-pdf-documents/live-editing-and-storage.md "Replacing the stored file": the room's word of a
// replacement, and of one it refused, reach the surface of the tab they name.
import { describe, expect, it, vi } from 'vitest';
import { PdfStoredFiles } from './pdf-document-bus';

describe('PdfStoredFiles', () => {
  it('tells a tab’s listeners its stored file was replaced, and no other tab’s', () => {
    const mine = vi.fn();
    const theirs = vi.fn();
    const stop = PdfStoredFiles.onReplaced('t1', mine);
    PdfStoredFiles.onReplaced('t2', theirs);
    PdfStoredFiles.replaced('t1');
    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
    stop();
    PdfStoredFiles.replaced('t1');
    expect(mine).toHaveBeenCalledTimes(1);
  });

  it('tells who asked for a replacement why the room refused it', () => {
    const refused = vi.fn();
    const stop = PdfStoredFiles.onRefused('t1', refused);
    PdfStoredFiles.refused('t2', 'blob_missing');
    PdfStoredFiles.refused('t1', 'live_changes_moved');
    expect(refused.mock.calls).toEqual([['live_changes_moved']]);
    stop();
    PdfStoredFiles.refused('t1', 'blob_missing');
    expect(refused).toHaveBeenCalledTimes(1);
  });
});
