# Signing

Drawn signatures, certificate signatures and checking the signatures a file arrives with (ruling C4). Researched
November 2026 with spikes on the corpus.

## Two things called a signature

| Kind                      | Is                                                                                | In the file                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Drawn signature**       | A picture of a signature: drawn, typed in a script face, or an uploaded image     | A mark on the page (a stamp with its own appearance), or the appearance of a signature field. It proves nothing by itself |
| **Certificate signature** | A cryptographic signature over the file's bytes, made with a person's private key | A signature field whose value holds a CMS signature and the byte range it covers (PAdES)                                  |

## Certificate signatures

**Signing in the browser** (verified by spike unless tagged):

- LibPDF signs with a `.p12` handed to it as bytes: `P12Signer.create(bytes, password)`, then `sign`. The result is
  an incremental update of about 25 KB on the file as it stood, sub-filter `ETSI.CAdES.detached` (PAdES), made in
  12 ms for a 1 MB file. poppler's `pdfsig` and a Web Crypto check both call it valid.
- A second signature on a signed file keeps the first valid. A highlight appended after a signature, by either
  writer, keeps it valid; the signature then covers "an earlier revision", not the whole file. A rewrite breaks it.
- The `.p12` is read by the page's own code and never leaves the browser: it is not uploaded, not stored, and the
  key is dropped when the dialog closes (a rule for the spec; LibPDF also signs with a Web Crypto `CryptoKey`
  through `CryptoKeySigner` (verified in its types), so a key imported as non-extractable can sign without its bytes
  being readable again: assumed, to be proven in Phase 11).
- Levels (verified: ETSI EN 319 142-1 names them; LibPDF's types list `B-B`, `B-T`, `B-LT`, `B-LTA`):

| Level     | Adds                                       | Needs from outside                           |
| --------- | ------------------------------------------ | -------------------------------------------- |
| **B-B**   | The signature and the signer's certificate | Nothing                                      |
| **B-T**   | A trusted time stamp                       | A time stamp authority the browser can reach |
| **B-LT**  | The revocation data, inside the file       | The certificate issuer's revocation service  |
| **B-LTA** | A document time stamp over all of it       | A time stamp authority, again later          |

- A time stamp authority and a revocation service are other people's servers, and most answer no browser (no
  cross-origin headers: assumed, to be proven per authority). So without a required outside service, **LiveDoc signs
  at B-B**, the time being the signer's own clock and said to be. B-T and above are offered when the host has
  configured a time stamp authority the api relays to (a self-hoster's choice, never a default call from docs.nu to
  a third party without it being named).

**Checking** (verified by spike):

- PDFium reads each signature's byte range, sub-filter, contents, reason and time, and verifies nothing. LibPDF
  verifies nothing ("not implemented").
- A check in the browser is about 50 lines over `pkijs` 4.0.1 (BSD-3-Clause) and Web Crypto: the SHA-256 of the byte range
  against the signed digest, and the signature over the signed attributes against the signer's certificate. It took
  2 to 19 ms a signature and agreed with poppler on every file signed in the spikes.
- What a browser cannot say alone is **whether the signer is trusted**: that needs a list of trusted roots (Adobe's
  AATL, the EU's trusted lists), which no browser exposes to a page. So the signatures panel says what LiveDoc can
  prove, in these words: the signature is intact or broken; what it covers (the whole file, or the file before later
  changes, which are then listed); who the certificate names; that LiveDoc has not checked who issued it.
- Certifying signatures carry a permission (`DocMDP`: no changes, filling and signing, or also marking), which the
  engine reads (verified: `FPDFSignatureObj_GetDocMDPPermission`). Reviewing must honour it: a change the signer
  forbade is refused with the reason, or made knowing it breaks the certification (F8's ground).

## Drawn signatures

- Draw (pointer or finger, pressure where the device gives it), type (in a script face from the document fonts), or
  upload a picture; the result is one vector or picture appearance, placed and sized on the page or into a signature
  field's box.
- Written as an incremental update, like any mark, so it invalidates nothing before it.
- Kept for reuse in this browser, or with the account when signed in (the plan's Phase 11); never in a document
  other people can read until it is placed.

## What each change does to a signed file (for fork F8)

| Change after a signature                         | The earlier signature                                               |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Marks, comments, field values, another signature | Stays valid; covers the earlier revision (verified)                 |
| A change its certification forbids               | Reads as broken in Acrobat (assumed: `DocMDP` rules of ISO 32000-2) |
| Page operations, edited text or pictures         | Broken: the file is rewritten (verified)                            |
| Redaction, protection, reduce file size          | Broken                                                              |

So F8's default holds as measured: Reviewing never breaks a signature; Editing does, says how many before it does,
and the signed file stays as a previous version ([Saving](saving.md)).
