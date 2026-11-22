// docs/specs/035-pdf-documents/pdf-document.md "What it holds": a PDF tab names its stored file by key and size.
import { describe, expect, it } from 'vitest';
import { FILE_TAB_MAX_BYTES } from './file-limits';
import { isPdfTab, pdfTabOf } from './pdf-tab';

const blob = 'ab'.repeat(32);

describe('isPdfTab', () => {
  it('knows a PDF tab from every other', () => {
    expect(isPdfTab({ kind: 'pdf' })).toBe(true);
    expect(isPdfTab({ kind: 'text-document' })).toBe(false);
    expect(isPdfTab({})).toBe(false);
    expect(isPdfTab(undefined)).toBe(false);
  });
});

describe('pdfTabOf', () => {
  it('reads the stored file a PDF tab names', () => {
    expect(pdfTabOf({ kind: 'pdf', blob, size: 1_024 })).toEqual({ blob, size: 1_024 });
  });

  it('reads none from a tab of another kind', () => {
    expect(pdfTabOf({ kind: 'text-document', blob, size: 1 })).toBeNull();
    expect(pdfTabOf(undefined)).toBeNull();
  });

  it.each(['', 'AB'.repeat(32), 'ab'.repeat(31), 7, undefined])('refuses the key %j', (key) => {
    expect(pdfTabOf({ kind: 'pdf', blob: key, size: 1 })).toBeNull();
  });

  // docs/specs/006-document/blob-store.md "Limits": FILE_TAB_MAX_BYTES bounds every blob.
  it.each([0, -1, 1.5, Number.NaN, '12', undefined, FILE_TAB_MAX_BYTES + 1])(
    'refuses the size %j',
    (size) => {
      expect(pdfTabOf({ kind: 'pdf', blob, size })).toBeNull();
    },
  );

  it('accepts a file of exactly the cap', () => {
    expect(pdfTabOf({ kind: 'pdf', blob, size: FILE_TAB_MAX_BYTES })?.size).toBe(
      FILE_TAB_MAX_BYTES,
    );
  });
});
