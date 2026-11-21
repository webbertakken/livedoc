# Redaction and protection

**Status: specified.** Nothing is built.

Three tools that change what a file gives away: **redaction** removes content for good, **removing hidden
information** strips what a reader does not see, and **protection** sets a PDF's passwords and permissions. All three
are Editing's, an Editor's, and a person's: no agent runs them ([Agents](agents.md#changesets)). Each rewrites the
file **and replaces the stored file with its history**, since what was removed must survive nowhere. The research is
[Security](../../research/pdf-documents/security.md) and [Saving](../../research/pdf-documents/saving.md).

## Marking

Redaction is two steps, so nothing is destroyed by a slip: content is **marked**, reviewed, then **applied**.

- **Mark for redaction** (⇧Y, Tools > Redact): with the tool in hand, selecting text marks it; a drag marks an area
  (over a picture, a scan, a drawing); a double press marks a word, a press on a picture marks the picture. **Mark
  pages** marks whole pages by range.
- **Find text to redact**: a word or phrase, several at once (a list, one a line), or a pattern: email addresses,
  phone numbers, dates, credit card numbers, national identity numbers in the formats listed. Results are listed
  with their line of text; the person ticks the ones to mark. Patterns are LiveDoc's own matchers, run in the
  browser; nothing is sent anywhere.
- **A redaction mark** shows as an outline in the redaction colour over content still readable, so it can be
  checked; hovering shows it as it will look applied. It is moved, resized and deleted as a mark is, and is listed
  in the comments panel under **Redactions**, each with its page and the text it will remove.
- **Look when applied** (per mark, with a default): the fill colour (black by default, from the one
  [colour picker](../004-interface-design/colour-picker.md)), optional **overlay text** (custom words, or a
  **redaction code**) in a font, size and colour, repeated to fill the area or once, aligned.
- **Redaction codes**: named sets of codes with their meanings ("Exemption 6: personal privacy"); a person makes,
  edits and deletes sets and codes, kept with the account, and picks one or several for a mark. No set ships with
  LiveDoc but two examples a person may delete `(default)`.
- Redaction marks are **live for everyone and not yet applied**: others see them outlined; they are in the file as
  the standard's own redaction annotations if it is baked meanwhile, so another reader can apply them too.

## Applying

- **Apply redactions** (Tools > Redact) opens a dialog that says exactly what will happen, and nothing proceeds
  without it: "Apply 14 redactions on 6 pages? The marked text and pictures are removed from this PDF for good. The
  earlier file, its versions and its history are deleted, for everyone. This can't be undone."
- A tick, on by default: **Also remove hidden information** ([below](#removing-hidden-information)).
- **What applying does to the content**: the text under a mark is removed from the page's content, not covered;
  the part of a picture under a mark is replaced by the fill in the picture's own pixels; shapes are cut; marks,
  links and field values under it are removed; the same words are removed from bookmarks, the structure tree's
  alternative text and recognised text where they fall under the mark. The fill and overlay text are then drawn.
- **The test of a redaction** is the file, not the page: text extracted from a redacted area of the baked file is
  empty, a search of the file's bytes for the removed text finds nothing, and the picture's removed pixels are gone
  from its stream.
- A mark that cannot be applied cleanly (text in a font with no character map, where LiveDoc cannot tell which
  glyphs fall under the mark) removes the whole text object it touches, and says so in the dialog before applying:
  "2 redactions remove more than was marked, to be safe."
- Applying is refused while anyone else has unconfirmed changes to the document, and while a bake is being made.

## What applying removes

Applying redactions, and removing hidden information, do what no other change does:

- The stored file is **replaced** by the rewritten one ([Saving](saving.md#when-the-stored-file-is-replaced)).
- **Every earlier stored file is purged** from the blob store, held or not, with every previous version and named
  version that pointed at one ([Blob store](../006-document/blob-store.md#holds-and-retention)).
- **The live changes' history is cut**: version history starts again from the redacted file; undo before it is gone
  for everyone.
- Branches of the document that hold the earlier file are listed in the dialog and are purged with it, or the
  redaction is not applied `(default)`.
- Copies made earlier (Make a copy, a download, a repository's git history, a Drive revision) are **not** reached,
  and the dialog says so: "Copies made before now, and files already downloaded or synced, still hold the removed
  content."
- Search text, thumbnails and previews are remade from the new file.

## Removing hidden information

**Tools > Protect > Remove hidden information** finds what the file holds that a reader does not see, lists it with
counts, and removes what is ticked:

| Found                                                                                  | Removing it                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Metadata: properties, XMP, the producing program                                       | Emptied, but the title where the person keeps it                         |
| Marks and comments, with their authors and dates                                       | Removed, or flattened, as chosen                                         |
| Field values, and field data stored for import                                         | Emptied                                                                  |
| Embedded files and pinned files                                                        | Removed                                                                  |
| Scripts and actions                                                                    | Removed                                                                  |
| Hidden PDF layers                                                                      | Removed with their content; shown layers flattened                       |
| Hidden text: invisible, white on white, off the page, under a picture                  | Removed (recognised text of a scan is listed apart, and kept by default) |
| Cropped-off content, and the hidden parts of cropped pictures                          | Removed                                                                  |
| Content of earlier saves still in the file's bytes                                     | Removed: the file is rewritten whole                                     |
| Overlapping objects                                                                    | Listed only, with their pages, for a person to look at                   |
| Unreferenced data, thumbnails, private data of other software, embedded search indexes | Removed                                                                  |
| Links                                                                                  | Listed; removed where ticked                                             |

- Each row says how many it found and shows them where they can be shown.
- Removing follows the rules of [What applying removes](#what-applying-removes): a rewrite, the stored file
  replaced, earlier files purged, said first.
- Accessibility content (the structure tree, alternative text) is never ticked by default.

## Protection

Fork F9 `(default)`. A PDF's protection is its **open password** and its **permissions password**
([Opening](opening.md#passwords) says how a protected file is read).

- **Tools > Protect > Set passwords and permissions**:

| Setting                       | Choices                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **Open password**             | Off, or a password asked of everyone who opens the file                                            |
| **Permissions password**      | Off, or a password that guards the permissions below; it must differ from the open password        |
| **Printing**                  | Allowed; low resolution only; not allowed                                                          |
| **Changes**                   | Any; marks, filling and signing; filling and signing; inserting, deleting and rotating pages; none |
| **Copying text and pictures** | Allowed; not allowed (text for screen readers stays allowed, always)                               |
| **What is encrypted**         | Everything; everything but the metadata (so search engines read the title); embedded files only    |

- **Encryption is AES-256** always (the standard's revision 6), raising the file's version to what it needs and
  saying so; older, weaker ciphers are read and never written.
- **A strength meter** and a second entry guard the password; LiveDoc says plainly: "If you forget this password, the
  PDF can't be opened. LiveDoc can't recover it."
- **Passwords are the person's.** They are typed into the engine's worker, used to encrypt there, and never stored,
  logged or sent to LiveDoc's servers; the protected bytes are what is stored.
- **The permissions are a request**, and the dialog says so: "Other programs may ignore these limits. To keep people
  from reading a PDF, use an open password."
- **Applying protection** replaces the stored file ([Saving](saving.md#when-the-stored-file-is-replaced)): everyone
  on the document is asked for the open password from then on; LiveDoc's servers no longer draw or search the file
  ([Live editing and storage](live-editing-and-storage.md#what-the-servers-make)); earlier, unprotected stored files
  are purged `(default)`, said first.
- **Remove protection** (given the permissions password, or the open password where there is no other) rewrites the
  file unprotected and replaces the stored file.
- **Change** opens the dialog with the current settings.
- Certificates as recipients (encrypting to people's certificates), security policies and rights servers are left
  out; a file encrypted that way is refused by name ([Opening](opening.md#refusals), fork F14).
- Sharing in LiveDoc is not protection: who may open a document here is its share roles
  ([PDF document](pdf-document.md#share-roles)).

## Limits

| Constant                     | Value | Why                                                                    |
| ---------------------------- | ----- | ---------------------------------------------------------------------- |
| `PDF_PASSWORD_MAX_BYTES`     | 127   | The standard's own limit for a revision 6 password, in UTF-8           |
| `PDF_REDACTION_FIND_MAX`     | 5,000 | `(default)` Results one Find text to redact lists; more asks to narrow |
| `PDF_REDACTION_CODES_MAX`    | 500   | `(default)` Codes in one set                                           |
| `PDF_OVERLAY_TEXT_MAX_CHARS` | 200   | `(default)` A redaction's overlay text                                 |

## Share roles

| Role            | May                                                                                     |
| --------------- | --------------------------------------------------------------------------------------- |
| **Editor**      | Mark and apply redactions, remove hidden information, set, change and remove protection |
| **Participant** | See redaction marks; nothing more. Marking for redaction is not a Reviewing tool        |
| **Viewer**      | See redaction marks                                                                     |

## Keyboard and accessibility

- Text is marked for redaction from a keyboard selection; areas by a rectangle placed at the caret and sized by
  keys; every mark is a row in the Redactions list, with its text read out.
- The Apply dialog's consequences are its text, read in full before its buttons; the default button is **Cancel**.
- A redacted area in the file is announced as "Redacted" where the file is tagged.

## Telemetry and observability

- `Pdf · Added · RedactionMark.<Text|Area|Page|Found>`, `Pdf · Changed · RedactionsApplied`,
  `Pdf · Changed · HiddenInformationRemoved`, `Pdf · Changed · Protection.<Set|Changed|Removed>`. Never a password, a
  pattern, a code or any removed text.
- Fingerprints: `[pdf] redactions applied=<n> widened=<n> pages=<n>`, `[pdf] redaction-verified
text-left=<0|n>` (a non-zero count fails the apply and nothing is stored), `[pdf] hidden-found kinds=<n>`,
  `[pdf] purged files=<n> versions=<n>`, `[pdf] protection set open=<bool> permissions=<bool>`. No log carries
  what was removed.

## Errors

| When                                              | A person sees                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Verification finds removed text still in the file | "The redactions couldn't be applied safely. Nothing was changed." Nothing is stored |
| Someone has unconfirmed changes                   | "Wait until everyone's changes are saved, then apply."                              |
| The two passwords are the same                    | "Use a different password for permissions."                                         |
| The passwords do not match                        | "The passwords don't match."                                                        |
| The permissions password is wrong                 | "That password doesn't change this PDF's protection."                               |
| A branch holds the earlier file                   | "2 branches still hold the content you are removing." **Delete them and apply**     |
