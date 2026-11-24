// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "The first-time question", "Telemetry and observability": asked while
// offered and unanswered, counted once as it shows; each answer sets the setting; a dismissal says where it lives.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { DARK_PAGES_LATER_COPY, usePdfDarkPagesQuestion } from './usePdfDarkPagesQuestion';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

function asked(offered = true, setting: boolean | undefined = undefined) {
  const choose = vi.fn();
  const say = vi.fn();
  const hook = renderHook(
    (props: { offered: boolean; setting: boolean | undefined }) =>
      usePdfDarkPagesQuestion({ ...props, choose, say }),
    { initialProps: { offered, setting } },
  );
  return { ...hook, choose, say };
}

describe('the first-time question', () => {
  it('stands while Dark pages is offered and unanswered, counted and logged once', () => {
    const { result, rerender } = asked();
    expect(result.current.asking).toBe(true);
    rerender({ offered: false, setting: undefined });
    rerender({ offered: true, setting: undefined });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('Pdf', 'Opened', 'DarkPagesQuestion');
    expect(debugLog).toHaveBeenCalledWith('[pdf] dark-pages asked');
  });

  it('is never asked once answered, nor where Dark pages is not offered', () => {
    expect(asked(true, false).result.current.asking).toBe(false);
    expect(asked(true, true).result.current.asking).toBe(false);
    expect(asked(false).result.current.asking).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('sets the setting by either answer, each counted', () => {
    const { result, choose, say } = asked();
    act(() => result.current.answer('Use'));
    expect(choose).toHaveBeenLastCalledWith(true);
    expect(track).toHaveBeenCalledWith('Pdf', 'Selected', 'DarkPagesQuestion.Use');
    act(() => result.current.answer('Keep'));
    expect(choose).toHaveBeenLastCalledWith(false);
    expect(say).not.toHaveBeenCalled();
  });

  it('leaves Dark pages off when dismissed, and says where the setting lives', () => {
    const { result, choose, say } = asked();
    act(() => result.current.answer('Dismissed'));
    expect(choose).toHaveBeenCalledWith(false);
    expect(track).toHaveBeenCalledWith('Pdf', 'Selected', 'DarkPagesQuestion.Dismissed');
    expect(say).toHaveBeenCalledWith(DARK_PAGES_LATER_COPY);
  });
});
