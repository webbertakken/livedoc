// Writes lib/office/special-characters.json from Unicode's Character Database (docs/specs/034-text-documents/
// objects.md "Special characters"), its latest version. Run: pnpm chars:special
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { specialCharacterCatalogueOf } from '../lib/office/special-character-catalogue.ts';

const UCD = 'https://www.unicode.org/Public/UCD/latest/ucd/';

async function read(file: string): Promise<string> {
  const response = await fetch(`${UCD}${file}`);
  if (!response.ok) throw new Error(`[chars] ${file} ${response.status}`);
  return response.text();
}

const [readMe, unicodeData, blocks, nameAliases] = await Promise.all(
  ['ReadMe.txt', 'UnicodeData.txt', 'Blocks.txt', 'NameAliases.txt'].map(read),
);
const version = /version (\d+\.\d+\.\d+) of/.exec(readMe!)?.[1];
if (!version) throw new Error('[chars] no version in ReadMe.txt');
const wire = specialCharacterCatalogueOf({
  version,
  unicodeData: unicodeData!,
  blocks: blocks!,
  nameAliases: nameAliases!,
});
// A group a line, so a new version's change reads as a diff of its groups.
const json = `{\n  "version": ${JSON.stringify(wire.version)},\n  "groups": [\n${wire.groups
  .map((group) => `    ${JSON.stringify(group)}`)
  .join(',\n')}\n  ],\n  "ranges": ${JSON.stringify(wire.ranges)}\n}\n`;
const out = fileURLToPath(new URL('../lib/office/special-characters.json', import.meta.url));
writeFileSync(out, json);
console.log(
  `[chars] wrote special-characters.json (Unicode ${version}, ${wire.groups.length} groups, ${json.length} bytes)`,
);
