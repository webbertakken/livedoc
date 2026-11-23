// docs/specs/035-pdf-documents/opening.md "Passwords"; reading-surface.md "Notices": a file that forbids changes opens
// in Viewing with "This PDF asks not to be changed."; a file asking anything else says it limits what can be done.
import { describe, expect, it } from 'vitest';
import { PdfPermissions } from '@livedoc/pdf-documents';
import { PDF_LIMITS_COPY, pdfLimitedLevel, pdfLimitsNotice } from './pdf-limits';

const NO_CHANGES = {
  ...PdfPermissions.all(),
  changeContent: false,
  mark: false,
  fill: false,
  organise: false,
};

describe('pdfLimitsNotice', () => {
  it('says a file forbids changes, limits something else, or nothing', () => {
    expect(pdfLimitsNotice(NO_CHANGES)).toBe('This PDF asks not to be changed.');
    expect(pdfLimitsNotice({ ...PdfPermissions.all(), copy: false })).toBe(
      'This PDF limits what can be done with it.',
    );
    expect(pdfLimitsNotice(PdfPermissions.all())).toBeNull();
  });
});

describe('pdfLimitedLevel', () => {
  it('draws a file that forbids changes for Viewing, whatever the level', () => {
    expect(pdfLimitedLevel('edit', NO_CHANGES)).toBe('view');
    expect(pdfLimitedLevel('participate', NO_CHANGES)).toBe('view');
    expect(pdfLimitedLevel('edit', { ...PdfPermissions.all(), copy: false })).toBe('edit');
    expect(pdfLimitedLevel('participate', null)).toBe('participate');
  });
});

describe('the permissions dialog’s copy', () => {
  it('says what the password does and when it did not', () => {
    expect(PDF_LIMITS_COPY.title).toBe('Permissions password');
    expect(PDF_LIMITS_COPY.line).toBe("Its permissions password lifts this PDF's limits for you.");
    expect(PDF_LIMITS_COPY.wrong).toBe("That password didn't lift this PDF's limits.");
    expect(PDF_LIMITS_COPY.action).toBe('Enter permissions password');
  });
});
