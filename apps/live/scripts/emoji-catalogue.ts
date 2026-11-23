// Writes lib/office/emoji.json from Emojibase's English data (docs/specs/034-text-documents/objects.md "Emoji"), at
// the version below. Run: pnpm chars:emoji
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { emojiCatalogueOf } from '../lib/office/emoji-catalogue.ts';

// Emojibase's data package; its licence is packages/licences/texts/emojibase-data-<version>-LICENSE.txt.
const EMOJIBASE_VERSION = '18.0.0';
const DATA = `https://cdn.jsdelivr.net/npm/emojibase-data@${EMOJIBASE_VERSION}/en/`;

async function read(file: string): Promise<unknown> {
  const response = await fetch(`${DATA}${file}`);
  if (!response.ok) throw new Error(`[emoji] ${file} ${response.status}`);
  return response.json();
}

const [compact, cldr, emojibase] = await Promise.all(
  ['compact.json', 'shortcodes/cldr.json', 'shortcodes/emojibase.json'].map(read),
);
const wire = emojiCatalogueOf({
  version: EMOJIBASE_VERSION,
  compact: compact as Parameters<typeof emojiCatalogueOf>[0]['compact'],
  // CLDR's shortcodes first: the one a cell's preview shows.
  shortcodes: [cldr, emojibase] as Record<string, string | string[]>[],
});
// An emoji a line, so a new version's change reads as a diff of its emoji.
const json = `{\n  "version": ${JSON.stringify(wire.version)},\n  "emoji": [\n${wire.emoji
  .map((row) => `    ${JSON.stringify(row)}`)
  .join(',\n')}\n  ]\n}\n`;
const out = fileURLToPath(new URL('../lib/office/emoji.json', import.meta.url));
writeFileSync(out, json);
console.log(
  `[emoji] wrote emoji.json (Emojibase ${wire.version}, ${wire.emoji.length} emoji, ${json.length} bytes)`,
);
