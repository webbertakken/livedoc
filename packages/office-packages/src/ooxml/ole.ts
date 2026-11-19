// OLE compound files (docs/specs/020-import-export/office-packages.md "Reading a package" step 3): a password-protected
// `.docx` is an OLE file holding an `EncryptionInfo` stream; any other OLE file (a Word 97 `.doc`) is not a package
// LiveDoc reads.
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// "EncryptionInfo" as the compound file's directory names it: UTF-16LE.
const ENCRYPTION_INFO = new Uint8Array([...'EncryptionInfo'].flatMap((c) => [c.charCodeAt(0), 0]));

function includes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** `encrypted` for an encrypted OOXML file, `other` for another OLE file, undefined when it is no OLE file. */
export function oleKind(bytes: Uint8Array): 'encrypted' | 'other' | undefined {
  if (!OLE_MAGIC.every((b, i) => bytes[i] === b)) return undefined;
  return includes(bytes, ENCRYPTION_INFO) ? 'encrypted' : 'other';
}
