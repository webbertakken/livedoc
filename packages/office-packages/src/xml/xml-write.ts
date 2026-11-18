// Writing XML text (docs/specs/020-import-export/office-packages.md "Writing a package"): UTF-8, escaped so any
// character a person typed reads back the same.

// Whether XML 1.0 can hold the code point (its `Char` production): tab, line feed, carriage return, and every other
// code point from space up, but the surrogates and U+FFFE, U+FFFF.
function isXmlChar(code: number): boolean {
  if (code === 0x9 || code === 0xa || code === 0xd) return true;
  if (code < 0x20) return false;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return code !== 0xfffe && code !== 0xffff;
}

// What XML cannot hold (controls, unpaired surrogates, the two non-characters) is dropped on write, so a written file
// always parses. Iterating by code point keeps a paired surrogate whole.
function xmlCharsOnly(text: string): string {
  let out = '';
  for (const char of text) if (isXmlChar(char.codePointAt(0)!)) out += char;
  return out;
}

/** Text content, escaped. */
export function escapeXmlText(text: string): string {
  return xmlCharsOnly(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** An attribute value in double quotes, escaped. */
export function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
