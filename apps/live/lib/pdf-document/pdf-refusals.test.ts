// docs/specs/035-pdf-documents/opening.md "Refusals": a glyph, one sentence as the heading, a second line saying what
// can still be done, Download wherever the bytes are held, Try again after a stop; "Passwords": the screen's copy;
// "Telemetry and observability": `Pdf · Opened · <Outcome>`.
import { describe, expect, it } from 'vitest';
import {
  PDF_PASSWORD_COPY,
  PDF_REFUSAL_COPY,
  PDF_REFUSAL_GLYPH,
  pdfOpenedType,
  pdfRefusalDownloads,
  pdfRefusalRetries,
  pdfRefusalWords,
  type PdfSurfaceRefusal,
} from './pdf-refusals';

const REFUSALS = Object.keys(PDF_REFUSAL_COPY) as PdfSurfaceRefusal[];

describe('what a refusal says and offers', () => {
  it('has the spec’s copy for every refusal, ending as a sentence', () => {
    for (const sentence of Object.values(PDF_REFUSAL_COPY)) expect(sentence).toMatch(/\.$/);
    expect(PDF_REFUSAL_COPY.pdf_damaged).toBe(
      "This PDF is damaged and can't be opened. You can still download the file.",
    );
    expect(REFUSALS).not.toContain('pdf_password');
  });

  it('heads with the first sentence and says the rest on the second line', () => {
    expect(pdfRefusalWords('pdf_damaged')).toEqual({
      sentence: "This PDF is damaged and can't be opened.",
      then: 'You can still download the file.',
    });
    expect(pdfRefusalWords('pdf_stopped')).toEqual({
      sentence: 'LiveDoc stopped reading this PDF, because it asked for too much time or memory.',
      then: null,
    });
    // "100 MB," is no sentence's end.
    expect(pdfRefusalWords('file_too_large').then).toBeNull();
  });

  it('has a glyph for every refusal, the protected ones a lock', () => {
    for (const refusal of REFUSALS) expect(PDF_REFUSAL_GLYPH[refusal].length).toBeGreaterThan(0);
    expect(PDF_REFUSAL_GLYPH.pdf_rights_protected).toBe(
      PDF_REFUSAL_GLYPH.pdf_certificate_protected,
    );
    expect(PDF_REFUSAL_GLYPH.pdf_damaged).not.toBe(PDF_REFUSAL_GLYPH.pdf_newer);
  });

  it('offers Download unless the bytes are not held, and Try again only after a stop', () => {
    expect(pdfRefusalDownloads('pdf_damaged')).toBe(true);
    expect(pdfRefusalDownloads('pdf_certificate_protected')).toBe(true);
    expect(pdfRefusalDownloads('blob_missing')).toBe(false);
    expect(pdfRefusalDownloads('files_unavailable')).toBe(false);
    expect(pdfRefusalDownloads('file_too_large')).toBe(false);
    expect(pdfRefusalRetries('pdf_stopped')).toBe(true);
    expect(pdfRefusalRetries('pdf_damaged')).toBe(false);
  });
});

describe('the password screen’s copy', () => {
  it('asks for the password and says when one did not open the file', () => {
    expect(`${PDF_PASSWORD_COPY.sentence} ${PDF_PASSWORD_COPY.then}`).toBe(
      'This PDF is protected. Enter its password to open it.',
    );
    expect(PDF_PASSWORD_COPY.wrong).toBe("That password didn't open this PDF.");
  });
});

describe('pdfOpenedType', () => {
  it('names each outcome as the telemetry spec does', () => {
    expect(pdfOpenedType('read')).toBe('Read');
    expect(pdfOpenedType('password')).toBe('PasswordGiven');
    expect(pdfOpenedType('repaired')).toBe('Repaired');
    expect(
      [
        'pdf_damaged',
        'pdf_newer',
        'pdf_certificate_protected',
        'pdf_rights_protected',
        'pdf_stopped',
        'file_too_large',
        'files_unavailable',
        'blob_missing',
      ].map((refusal) => pdfOpenedType(refusal as PdfSurfaceRefusal)),
    ).toEqual([
      'Refused.Damaged',
      'Refused.Newer',
      'Refused.CertificateProtected',
      'Refused.RightsProtected',
      'Refused.Stopped',
      'Refused.TooLarge',
      'Refused.NoFileStorage',
      'Refused.BlobMissing',
    ]);
  });
});
