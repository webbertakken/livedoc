// Bytes and base64, as a text document's updates travel in a room frame and a create request (Web APIs only, so the
// editor, the api and the CLI share it).

/** The bytes of a base64 string, or null when it is not base64. */
export function bytesOfBase64(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The bytes as base64. */
export function base64OfBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
