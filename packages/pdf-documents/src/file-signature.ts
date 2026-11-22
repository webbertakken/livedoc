// A certificate signature a file arrives with, as read (docs/specs/035-pdf-documents/signing.md "The signatures
// panel", "Certified files"): what the file says of it, and what its byte range covers. Reading is not checking:
// nothing here says a signature is intact, or who is trusted.
import { PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from './limits';

/** Whom a signature's certificate names. A certificate says this of itself: it is shown, never trusted. */
export type SignerCertificate = {
  readonly name: string;
  readonly organisation: string;
  /** The name of who issued it. */
  readonly issuer: string;
  /** Milliseconds since the epoch. */
  readonly validFrom: number;
  readonly validTo: number;
  /** Its serial number, in hexadecimal. */
  readonly serial: string;
};

/** What a certifying signature allows afterwards. */
export type Certification = 'no-changes' | 'fields' | 'fields-and-marks';

export type FileSignature = {
  /** How the file says it is encoded (`ETSI.CAdES.detached`); empty where it names nothing. */
  readonly encoding: string;
  /** When it was made by the signer's own clock, as the file writes a date; empty where it gives none. */
  readonly time: string;
  readonly reason: string;
  /** The whole file, the file before later changes, or nothing that can be said. */
  readonly covers: 'whole-file' | 'earlier-state' | 'unknown';
  /** How many bytes the file had when it was signed; null where `covers` is unknown. */
  readonly signedBytes: number | null;
  /** What it allows afterwards where it certifies the file; null where it does not. */
  readonly certifies: Certification | null;
  /** Whom its certificate names; null where its bytes hold no certificate its signer names. */
  readonly signer: SignerCertificate | null;
};

/** A signature as the reader hands it over: the file's own words and numbers, unchecked. */
export type SignatureRead = {
  readonly encoding: string;
  readonly time: string;
  readonly reason: string;
  /** The byte range: a start and a length, twice. */
  readonly byteRange: readonly number[];
  /** The standard's number for what a certifying signature allows: 1, 2 or 3; anything else certifies nothing. */
  readonly permission: number;
};

const CERTIFICATIONS: Readonly<Record<number, Certification>> = {
  1: 'no-changes',
  2: 'fields',
  3: 'fields-and-marks',
};

/**
 * How many bytes of a file a byte range signed, or null: the range is two runs, the first from the file's start, the
 * second after it, both inside the file. Between them sits the signature itself.
 */
function signedBytesOf(range: readonly number[], fileBytes: number): number | null {
  if (range.length !== 4 || !range.every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
  const [start, first, second, last] = range as unknown as [number, number, number, number];
  if (start !== 0 || first === 0 || second < first || second + last > fileBytes) return null;
  return second + last;
}

export const FileSignature = {
  /** The signature a file of `fileBytes` bytes holds, with whom its certificate names. */
  of: (read: SignatureRead, fileBytes: number, signer: SignerCertificate | null): FileSignature => {
    const signedBytes = signedBytesOf(read.byteRange, fileBytes);
    return {
      encoding: read.encoding.slice(0, PDF_NAME_MAX_CHARS),
      time: read.time.slice(0, PDF_NAME_MAX_CHARS),
      reason: read.reason.slice(0, PDF_PROPERTY_MAX_CHARS),
      covers:
        signedBytes === null
          ? 'unknown'
          : signedBytes === fileBytes
            ? 'whole-file'
            : 'earlier-state',
      signedBytes,
      certifies: CERTIFICATIONS[read.permission] ?? null,
      signer,
    };
  },
} as const;
