// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": Copy puts the selection on the clipboard as plain text
// (Edit > Copy, or ⌘C heard by the surface); a file that asks not to be copied dims
// Copy with the reason and ⌘C says so; a clipboard the browser refuses says so; Select all is the page in view's text.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { COPY, SELECT_ALL } from './pdf-menus';
import {
  COPY_FAILED_COPY,
  COPY_NOT_ALLOWED_LABEL,
  COPY_REFUSED_COPY,
  usePdfTextActions,
} from './usePdfTextActions';
import type { PdfTextSelected } from './usePdfTextSelection';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const SELECTED: PdfTextSelected = { page: 0, spans: [[0, 5]], quads: [], text: 'Hello' };

function actions({ selected = SELECTED as PdfTextSelected | null, mayCopy = true } = {}) {
  const onProblem = vi.fn();
  const selectAll = vi.fn();
  const hook = renderHook(() =>
    usePdfTextActions({ selected, selectAll, page: 2, mayCopy, onProblem }),
  );
  return { hook, onProblem, selectAll };
}

afterEach(() => vi.clearAllMocks());

describe('copying the selected text', () => {
  it('writes the selection to the clipboard from Edit > Copy', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { hook } = actions();
    await act(async () => hook.result.current.actions[COPY]!.run());
    expect(writeText).toHaveBeenCalledWith('Hello');
    expect(debugLog).toHaveBeenCalledWith('[pdf] text-copied chars=5');
    expect(track).toHaveBeenCalledWith('Pdf', 'Copied', 'Text');
  });

  it('says so when the browser refuses the clipboard', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => Promise.reject()) } });
    const { hook, onProblem } = actions();
    await act(async () => hook.result.current.actions[COPY]!.run());
    expect(debugLog).toHaveBeenCalledWith('[pdf] text-copy-failed');
    expect(onProblem).toHaveBeenCalledWith(COPY_FAILED_COPY);
    expect(COPY_FAILED_COPY).toBe('The text couldn’t be copied.');
  });

  it('dims Copy while nothing is selected', () => {
    expect(actions({ selected: null }).hook.result.current.actions[COPY]).toMatchObject({
      disabled: true,
    });
  });

  it('dims Copy with the reason where the file asks not to be copied', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { hook } = actions({ mayCopy: false });
    expect(hook.result.current.actions[COPY]).toMatchObject({
      disabled: true,
      label: COPY_NOT_ALLOWED_LABEL,
    });
    expect(COPY_NOT_ALLOWED_LABEL).toBe('Copy (this PDF asks not to be copied)');
    await act(async () => hook.result.current.actions[COPY]!.run());
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies on ⌘C, and leaves the key to the browser with nothing selected', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { hook } = actions();
    await act(async () => expect(hook.result.current.copyKey()).toBe(true));
    expect(writeText).toHaveBeenCalledWith('Hello');
    expect(track).toHaveBeenCalledWith('Pdf', 'Copied', 'Text');
    expect(actions({ selected: null }).hook.result.current.copyKey()).toBe(false);
  });

  it('says the file asks not to be copied on ⌘C, copying nothing', () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { hook, onProblem } = actions({ mayCopy: false });
    expect(hook.result.current.copyKey()).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(debugLog).toHaveBeenCalledWith('[pdf] text-copy-refused');
    expect(onProblem).toHaveBeenCalledWith(COPY_REFUSED_COPY);
    expect(COPY_REFUSED_COPY).toBe('This PDF asks not to be copied.');
  });
});

describe('selecting all', () => {
  it('selects the text of the page in view', () => {
    const { hook, selectAll } = actions();
    hook.result.current.actions[SELECT_ALL]!.run();
    expect(selectAll).toHaveBeenCalledWith(2);
  });
});
