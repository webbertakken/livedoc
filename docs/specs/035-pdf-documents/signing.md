# Signing

**Status: specified.** Nothing is built.

Two things are called a signature, and a [PDF document](pdf-document.md) has both (ruling C4): a **drawn signature**,
a picture of a signature placed on a page, and a **certificate signature**, a cryptographic signature over the file's
bytes made with a person's own certificate file. LiveDoc also checks the signatures a file arrives with. Sending a
document out for signature, and certificates issued by LiveDoc, are left out. Signing is Reviewing's
([Editing modes](editing-modes.md)). The research is [Signing](../../research/pdf-documents/signing.md).

## Drawn signatures

- **Making one** (Insert > Signature > Drawn signature, or the Sign tool): a dialog with three ways, **Draw** (pointer
  or finger, pressure where the device gives it, with Clear), **Type** (the person's name in one of four script
  faces from the document fonts) and **Upload** (a picture; its paper made transparent on request). One colour:
  black, blue or the person's own from the colour picker. **Initials** are made the same way and kept apart.
- **Kept for reuse**, where the person ticks "Keep this signature": in this browser, or with the account when signed
  in; at most `PDF_KEPT_SIGNATURES` signatures and as many initials. A kept signature is never in a document other
  people can read until it is placed, and is removed from **Manage signatures** at any time.
- **Placing**: the signature follows the pointer and lands on a press, or by Enter at the text caret; it lands inside
  a **signature field** when placed on one, fitted to the field's box. It is then moved, resized and deleted as a
  mark is, by its maker.
- **In the file** it is a stamp annotation with its own appearance, or the appearance of the signature field it sits
  in, written as an addition, so it invalidates nothing before it ([Saving](saving.md#addition-or-rewrite)).
- **It proves nothing by itself.** The place it is made says so once: "A drawn signature is a picture. To prove who
  signed and that nothing changed since, use a certificate signature."
- Dates, names and other text beside a signature are Text marks; **Sign here** stamps show where one is wanted
  ([Marks](marks.md#stamps)).

## Certificate signatures

- **Signing** (Insert > Signature > Certificate signature): the person chooses their **certificate file** (`.p12` or
  `.pfx`) and gives its password; the dialog shows whom the certificate names, who issued it and when it expires.
  They may add a **reason**, a **place** and contact details, and choose **visible** (a box they drag on a page, or an
  empty signature field) or **not visible**.
- **The certificate file never leaves the browser.** It is read by the page's own code, never uploaded, stored,
  logged or sent to the room; its key is imported as non-extractable where the browser allows and dropped when the
  dialog closes. LiveDoc's servers never see the key or its password.
- **What is signed is the bake**: the stored file with every live change written in. The signature is appended as an
  addition (PAdES, `ETSI.CAdES.detached`), and **the signed file becomes the stored file**, for everyone, in one step
  ([Saving](saving.md#when-the-stored-file-is-replaced)). Changes made after it sit on top as live changes.
- **Before signing**, the dialog lists what the signature will cover: pages, marks, field values, and who made the
  live changes about to be written in, so a person signs what they see.
- **Levels**: LiveDoc signs at **PAdES B-B** always: the signature and the signer's certificate, with the time from
  the signer's own clock, and says so ("Time from this computer"). Where the host has configured a time stamp
  authority, the dialog offers **Add a trusted time stamp** (B-T), and **Add verification information** (B-LT), which
  embeds the revocation data the issuer publishes; neither is a call docs.nu makes to a third party unless the host
  set one and its name is shown.
- **The visible appearance** shows the signer's name, the date, the reason and place where given, and optionally the
  person's drawn signature or a picture as its graphic; the text is real text, so it is read aloud.
- **Lock after signing** (a tick in the dialog): the signature locks every field, so no value changes afterwards;
  marks and further signatures are still additions on top.
- **A time stamp alone** (Insert > Signature > Time stamp, where the host configured an authority): a document time
  stamp with no signer, proving the file existed as it is at that time; it replaces the stored file as a certificate
  signature does.
- **Verification information after signing**: where the host configured an authority, a signature's row offers **Add
  verification information**, which appends the revocation data for that signature as an addition.
- **Several signatures**: a signed file is signed again as an addition; each earlier signature stays valid and covers
  the state it signed.
- **A file that cannot take an addition** (a repaired one) is not signed: "This PDF was damaged when it arrived.
  Download a repaired copy and sign that." ([Opening](opening.md#damaged-files))
- **Removing a certificate signature** is clearing its signature field, an Editor's act that says what it does: the
  signature's bytes stay in the file's earlier state, as the format has it; the field shows unsigned again.

## The signatures panel

The left panel's **Signatures** and the title row's signature chip. Each certificate signature is a row:

| Shown                            | Says                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intact or not**                | "Not changed since it was signed" or "The signed content was changed": the bytes' digest against the signed one, and the signature against the signer's certificate |
| **What it covers**               | "The whole file", or "The file before later changes", with those changes listed: marks added, fields filled, another signature, pages changed                       |
| **Who the certificate names**    | The subject's name and organisation, the issuer, the validity dates, the serial number                                                                              |
| **When**                         | The time, and whether it is the signer's clock or a trusted time stamp                                                                                              |
| **Reason and place**             | As the signer gave them                                                                                                                                             |
| **What LiveDoc has not checked** | "LiveDoc hasn't checked who issued this certificate." Always, plainly                                                                                               |

- **A browser cannot say whether a signer is trusted**: that needs a list of trusted issuers no page can read. So
  LiveDoc says what it can prove and never shows a green tick that means "trusted"; the row's glyph is "intact",
  "changed" or "can't be checked", each with words.
- **View signed version** opens the file as it stood when that signature was made, read-only, from the bytes the
  signature covers; **Compare with now** shows what changed since ([Document tools](document-tools.md#comparing)).
- **Download certificate** saves the signer's certificate as a `.cer` file.
- A signature whose kind LiveDoc cannot check (an unknown sub-filter or algorithm) reads "LiveDoc can't check this
  kind of signature."; nothing is guessed.
- Drawn signatures are listed under their own heading, as "A drawn signature by Ada, page 3", with the line that it
  proves nothing by itself.
- Signature fields still unsigned are listed with **Sign**.
- The check runs in the engine's worker, on Web Crypto, when the file opens and again when the stored file changes;
  it never asks a server.

## Certified files

A **certifying signature** carries what its signer allows afterwards: no changes; filling fields and signing; or
those and marks.

- LiveDoc reads it and honours it: a change the certifier forbade is refused with the reason ("The person who
  certified this PDF doesn't allow marks."), in Reviewing as in Editing.
- **Certify** (in the certificate signature dialog, when the file has no signature yet): the signer chooses one of
  the three; the choice is written with the signature.
- An Editor may still make a forbidden change through Editing, knowing it breaks the certification, after the warning
  below.

## Changes after a signature

| Change after a signature                                                        | The earlier signature                               |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Marks, comments, field values, a drawn signature, another certificate signature | Stays valid; it then covers the earlier state       |
| A change its certification forbids                                              | Refused in Reviewing; in Editing it reads as broken |
| A field it locked                                                               | Refused                                             |
| Page content, pages, document tools: any rewrite                                | Broken: the file is rewritten                       |
| Redaction, protection, reduce file size, flattening                             | Broken                                              |

- **Reviewing never breaks a signature.** The notice bar says so on a signed file: "This PDF is signed. Reviewing
  keeps its signatures valid."
- **Editing breaks them, and says so first** (fork F8 `(default)`). The first rewriting change on a stored file that
  carries certificate signatures opens a dialog: "Editing will invalidate 2 signatures. The signed version stays in
  version history." with **Edit anyway** and **Cancel**. It is asked once per stored file per person; entering
  Editing shows the same line as a notice before anything is changed.
- **The signed version is kept**: the stored file as signed stays a previous version for as long as the document
  lives, not 30 days, and is named "Signed by <name>, <date>" in version history
  ([Saving](saving.md#previous-versions-and-version-history)).
- After a rewrite the panel shows the old signatures as "Signed an earlier version" with **View signed version**;
  the pages no longer show them as valid.
- The alternatives passed over, kept for the ruling: refusing Editing on a signed file; editing only a copy.

## Limits

| Constant                          | Value     | Why                                                                                                |
| --------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `PDF_KEPT_SIGNATURES`             | 5         | `(default)` Kept drawn signatures, and as many initials, a person                                  |
| `PDF_SIGNATURE_PICTURE_MAX_BYTES` | 1,048,576 | `(default)` An uploaded signature picture; larger is scaled down                                   |
| `PDF_CERTIFICATE_FILE_MAX_BYTES`  | 1,048,576 | `(default)` A certificate file; real ones are a few kilobytes                                      |
| `PDF_SIGNATURE_RESERVED_BYTES`    | 32,768    | `(default)` Room kept in the file for the signature's bytes; a B-B signature is about 25 KB in all |
| `PDF_MAX_SIGNATURES_CHECKED`      | 200       | `(default)` Signatures checked on open; more are checked when their row is opened                  |

## Share roles

F7, ruled: a Participant signs, with drawn and with certificate signatures.

| Role            | Signing                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Places and removes drawn signatures; signs with a certificate; certifies; clears a signature field                     |
| **Participant** | Places drawn signatures and removes their own; signs with a certificate, which replaces the stored file by an addition |
| **Viewer**      | Reads the signatures panel, views a signed version, downloads a certificate; signs nothing                             |

## Keyboard and accessibility

- The Draw way has equals: Type and Upload make a drawn signature with no pointer; a kept signature is placed by
  Enter at the caret or the focused signature field, then moved by arrow keys.
- The certificate dialog is the shell's: every field labelled, the password field never echoed to a live region,
  errors tied to their field.
- A signature row's state is words, with a glyph beside them; "LiveDoc hasn't checked who issued this certificate" is
  part of the row's accessible name.
- A visible certificate signature on the page is a button named "Signed by <name>, <date>: <state>" that opens its
  row.

## Telemetry and observability

- `Pdf · Added · Signature.<Drawn|Typed|Uploaded|Kept>`, `Pdf · Added · CertificateSignature.<BB|BT|BLT>`,
  `Pdf · Added · Certification.<NoChanges|FillAndSign|FillSignAndMark>`, `Pdf · Opened · SignedVersion`,
  `Pdf · Selected · InvalidateSignatures.<Edit|Cancel>`. Never a signer's name, a reason or a certificate's contents.
- Fingerprints: `[pdf] signatures-checked count=<n> intact=<n> changed=<n> unchecked=<n> ms=<n>`,
  `[pdf] signed level=<level> bytes=<n> ms=<n>`, `[pdf] sign-refused reason=<reason>`. No log ever carries a key, a
  password, a certificate or a name.

## Errors

| When                                             | A person sees                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| The certificate file's password is wrong         | "That password didn't open this certificate file."                              |
| The file is not a certificate file               | "Choose a .p12 or .pfx file."                                                   |
| The certificate has expired, or is not yet valid | "This certificate expired on 3 May 2026." **Sign anyway** is not offered        |
| The certificate may not be used for signing      | "This certificate isn't meant for signing documents."                           |
| The time stamp authority does not answer         | "The time stamp service didn't answer. Sign with this computer's time instead?" |
| Someone else replaced the stored file meanwhile  | "This PDF changed while you were signing. Review it and sign again."            |
| A forbidden change on a certified file           | "The person who certified this PDF doesn't allow that."                         |
