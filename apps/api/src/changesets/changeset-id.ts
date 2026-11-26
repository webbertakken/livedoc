import { CHANGESET_ID_LENGTH } from '@livedoc/api-schema';

// Lowercase Crockford base32: no i, l, o or u, so an id read aloud or retyped survives (CS7).
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

type Random = (length: number) => Uint8Array;
const RANDOM: Random = (length) => crypto.getRandomValues(new Uint8Array(length));

function mint(prefix: string, random: Random): string {
  const bytes = random(CHANGESET_ID_LENGTH);
  let id = prefix;
  for (let i = 0; i < CHANGESET_ID_LENGTH; i += 1) id += ALPHABET[(bytes[i] ?? 0) & 31];
  return id;
}

// A changeset id (docs/specs/024-agents/agent-changesets.md "What a changeset is"): `cs_` and 10
// characters, 5 random bits each. A collision with an existing record is refused by the primary
// key, and the pipeline mints again once (CS7).
export function mintChangesetId(random: Random = RANDOM): string {
  return mint('cs_', random);
}

// A sheet changeset's id (agent-changesets.md "A sheet's changesets", D265): `sc_` and the same 10 characters.
export function mintSheetChangesetId(random: Random = RANDOM): string {
  return mint('sc_', random);
}
