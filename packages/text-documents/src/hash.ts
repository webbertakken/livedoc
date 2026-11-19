// A short, stable hash for names the writers give what they generate (standard-mapping.md "The flat file": automatic
// styles named by a hash of their properties), so the same document writes the same names.

/** FNV-1a, 32 bits, as eight hex digits. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
