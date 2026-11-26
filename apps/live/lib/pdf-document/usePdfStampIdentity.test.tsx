// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Stamps", "Telemetry and observability", "Errors": a person's stamp identity,
// kept in their preferences, read live, each field counted before it is kept, a field kept too long refused by name,
// and a field that could not be kept said and still used while this PDF is open.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_STAMP_IDENTITY_FIELD_MAX_CHARS } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';
import { STAMP_IDENTITY_NOT_SAVED_COPY, usePdfStampIdentity } from './usePdfStampIdentity';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(track).mockClear();
  vi.mocked(debugLog).mockClear();
});
afterEach(() => vi.restoreAllMocks());

const render = () => renderHook(() => usePdfStampIdentity({ ownerId: null }));

describe('a stamp identity', () => {
  it('is empty until filled in', () => {
    expect(render().result.current.identity).toEqual({});
  });

  it('keeps a field in the preferences, trimmed, counted before it is kept', () => {
    const { result } = render();
    let problem: string | null = 'unset';
    act(() => {
      problem = result.current.keep('title', '  Chief Engineer ');
    });
    expect(problem).toBeNull();
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'StampIdentity.Title');
    expect(readUserPreferences().pdfStampIdentity).toEqual({ title: 'Chief Engineer' });
    expect(result.current.identity).toEqual({ title: 'Chief Engineer' });
    expect(debugLog).toHaveBeenCalledWith('[pdf] stamp-identity-changed field=title set=yes');
  });

  it('clears a field emptied, the others kept', () => {
    const { result } = render();
    act(() => void result.current.keep('organisation', 'Analytical Ltd'));
    act(() => void result.current.keep('email', 'ada@example.org'));
    act(() => void result.current.keep('organisation', '   '));
    expect(result.current.identity).toEqual({ email: 'ada@example.org' });
    expect(debugLog).toHaveBeenCalledWith('[pdf] stamp-identity-changed field=organisation set=no');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'StampIdentity.Email');
  });

  it('follows a change made elsewhere (another tab, another PDF) without a reload', () => {
    const { result } = render();
    act(() =>
      writeUserPreferences({ ...readUserPreferences(), pdfStampIdentity: { unit: 'Engines' } }),
    );
    expect(result.current.identity).toEqual({ unit: 'Engines' });
  });

  it('refuses a field kept too long by name, and reads it as not set', () => {
    writeUserPreferences({
      pdfStampIdentity: {
        title: 'x'.repeat(PDF_STAMP_IDENTITY_FIELD_MAX_CHARS + 1),
        organisation: 'Analytical Ltd',
      },
    });
    const { result } = render();
    expect(result.current.identity).toEqual({ organisation: 'Analytical Ltd' });
    expect(debugLog).toHaveBeenCalledWith(
      '[pdf] stamp-identity-refused reason=stamp_identity_too_long field=title',
    );
  });

  it('says a field that could not be kept, and still uses it while this PDF is open', () => {
    const { result } = render();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    let problem: string | null = null;
    act(() => {
      problem = result.current.keep('title', 'Chief');
    });
    setItem.mockRestore();
    expect(problem).toBe(STAMP_IDENTITY_NOT_SAVED_COPY);
    expect(debugLog).toHaveBeenCalledWith('[pdf] stamp-identity-not-saved');
    expect(result.current.identity).toEqual({ title: 'Chief' });
  });
});
