// Whom a signature's certificate names (docs/specs/035-pdf-documents/signing.md "The signatures panel"): read from
// the signature's own bytes, a CMS signed-data structure. Reading is not checking: nothing here verifies the
// signature, the certificate or who issued it.
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import type { SignerCertificate } from '../file-signature';
import { PDF_NAME_MAX_CHARS } from '../limits';

// The attribute types of a certificate's name: the common name, the organisation.
const COMMON_NAME = '2.5.4.3';
const ORGANISATION = '2.5.4.10';
const SERIAL_MAX_CHARS = 64;

function said(name: pkijs.RelativeDistinguishedNames, type: string): string {
  const value: unknown = name.typesAndValues.find((part) => part.type === type)?.value.valueBlock
    .value;
  return typeof value === 'string' ? value.slice(0, PDF_NAME_MAX_CHARS) : '';
}

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The certificate the signature's signer names by issuer and serial number, or null: the bytes are no signed-data
 * structure, or carry no such certificate. Nothing is guessed from another certificate in them.
 */
export function signerOf(contents: Uint8Array): SignerCertificate | null {
  try {
    // A signature sits in room kept for it, so zeros follow its bytes: only the structure itself is read.
    const parsed = asn1js.fromBER(contents.slice().buffer);
    const content = new pkijs.ContentInfo({ schema: parsed.result }).content as unknown;
    const data = new pkijs.SignedData({ schema: content });
    const named = data.signerInfos[0]?.sid as unknown;
    if (!(named instanceof pkijs.IssuerAndSerialNumber)) return null;
    const certificate = (data.certificates ?? []).find(
      (held): held is pkijs.Certificate =>
        held instanceof pkijs.Certificate &&
        held.serialNumber.isEqual(named.serialNumber) &&
        held.issuer.isEqual(named.issuer),
    );
    if (!certificate) return null;
    return {
      name: said(certificate.subject, COMMON_NAME),
      organisation: said(certificate.subject, ORGANISATION),
      issuer: said(certificate.issuer, COMMON_NAME),
      validFrom: certificate.notBefore.value.getTime(),
      validTo: certificate.notAfter.value.getTime(),
      serial: hex(certificate.serialNumber.valueBlock.valueHexView).slice(0, SERIAL_MAX_CHARS),
    };
  } catch {
    return null;
  }
}
