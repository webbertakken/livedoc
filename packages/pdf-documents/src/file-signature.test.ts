import { describe, expect, it } from 'vitest';
import { FileSignature, type SignatureRead } from './file-signature';
import { PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from './limits';

const read: SignatureRead = {
  encoding: 'ETSI.CAdES.detached',
  time: 'D:20261121140203Z',
  reason: 'I approve',
  byteRange: [0, 100, 300, 700],
  permission: 0,
};
const covers = (byteRange: readonly number[], fileBytes = 1000) =>
  FileSignature.of({ ...read, byteRange }, fileBytes, null);

// signing.md "The signatures panel"
describe('a signature read from a file', () => {
  it('says what the file says of it', () => {
    expect(FileSignature.of(read, 1000, null)).toEqual({
      encoding: 'ETSI.CAdES.detached',
      time: 'D:20261121140203Z',
      reason: 'I approve',
      covers: 'whole-file',
      signedBytes: 1000,
      certifies: null,
      signer: null,
    });
  });

  it('covers the whole file where its byte range ends at the file’s end', () => {
    expect(covers([0, 100, 300, 700]).covers).toBe('whole-file');
  });

  it('covers the file before later changes where its byte range ends earlier', () => {
    const signature = covers([0, 100, 300, 500]);
    expect(signature.covers).toBe('earlier-state');
    expect(signature.signedBytes).toBe(800);
  });

  it('covers nothing that can be said where its byte range is not two runs in order inside the file', () => {
    for (const range of [
      [],
      [0, 100, 300],
      [0, 100, 300, 700, 5],
      [1, 100, 300, 700],
      [0, 0, 300, 700],
      [0, 400, 300, 700],
      [0, 100, 300, 701],
      [0, 100, -300, 700],
      [0, 100, 300.5, 699.5],
      [0, 100, 300, Number.NaN],
    ]) {
      const signature = covers(range);
      expect(signature.covers).toBe('unknown');
      expect(signature.signedBytes).toBeNull();
    }
  });

  // signing.md "Certified files"
  it('says what a certifying signature allows afterwards', () => {
    const certifies = (permission: number) =>
      FileSignature.of({ ...read, permission }, 1000, null).certifies;
    expect(certifies(1)).toBe('no-changes');
    expect(certifies(2)).toBe('fields');
    expect(certifies(3)).toBe('fields-and-marks');
    expect(certifies(0)).toBeNull();
    expect(certifies(4)).toBeNull();
  });

  it('cuts the file’s own words to what a file’s strings may be', () => {
    const long = FileSignature.of(
      { ...read, encoding: 'e'.repeat(999), time: 't'.repeat(999), reason: 'r'.repeat(9999) },
      1000,
      null,
    );
    expect(long.encoding).toHaveLength(PDF_NAME_MAX_CHARS);
    expect(long.time).toHaveLength(PDF_NAME_MAX_CHARS);
    expect(long.reason).toHaveLength(PDF_PROPERTY_MAX_CHARS);
  });
});
