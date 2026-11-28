// Who wrote what in a version (docs/specs/034-text-documents/review.md "Version history", Show changes): the
// authorship y-prosemirror draws a version's changes by, read from the version's own record rather than from
// Y.PermanentUserData, which would write into the document. Each Yjs client is its author's key; each deletion the key
// whose recorded deletions hold it; one whose author went unrecorded is drawn in the neutral grey of a file's author.
import * as Y from 'yjs';
import type { TextDocumentVersionReadDto } from '@livedoc/api-schema';
import { bytesOfBase64 } from '@livedoc/office-packages';

/** The user an unrecorded writer or deleter is drawn as; never a key (keys are ids, never this). */
export const UNRECORDED_EDITOR = '\u0000unrecorded';
/** The neutral grey of a file's author (review.md "Version history", (default)). */
export const VERSION_UNRECORDED_COLOUR = '#5f6368';

type DeleteSet = ReturnType<typeof Y.createDeleteSet>;
type ColourDef = { light: string; dark: string };

/** What y-prosemirror's sync plugin is given to draw a version's changes. */
export type VersionAuthorship = {
  readonly permanentUserData: {
    readonly getUserByClientId: (client: number) => string;
    readonly getUserByDeletedId: (id: Y.ID) => string;
    readonly dss: Map<string, DeleteSet>;
  };
  readonly colorMapping: Map<string, ColourDef>;
  readonly colors: ColourDef[];
};

const COLOUR = /^#[0-9a-f]{6}$/i;
const def = (colour: string): ColourDef => ({ light: colour, dark: colour });

/** The deletions a base64 snapshot holds, or none where it cannot be read. */
function deletionsOf(encoded: string): DeleteSet | null {
  const bytes = bytesOfBase64(encoded);
  if (!bytes) return null;
  try {
    return Y.decodeSnapshot(bytes).ds;
  } catch {
    return null;
  }
}

export function versionAuthorship(
  read: Pick<TextDocumentVersionReadDto, 'clients' | 'deletedBy'>,
): VersionAuthorship {
  const users = new Map<number, string>();
  const colorMapping = new Map<string, ColourDef>([
    [UNRECORDED_EDITOR, def(VERSION_UNRECORDED_COLOUR)],
  ]);
  for (const [client, editor] of Object.entries(read.clients)) {
    const id = Number(client);
    if (!Number.isInteger(id) || !editor.key) continue;
    users.set(id, editor.key);
    if (!colorMapping.has(editor.key)) {
      colorMapping.set(
        editor.key,
        def(editor.color && COLOUR.test(editor.color) ? editor.color : VERSION_UNRECORDED_COLOUR),
      );
    }
  }
  const dss = new Map<string, DeleteSet>();
  for (const [key, encoded] of Object.entries(read.deletedBy)) {
    const ds = deletionsOf(encoded);
    if (ds) dss.set(key, ds);
    if (ds && !colorMapping.has(key)) colorMapping.set(key, def(VERSION_UNRECORDED_COLOUR));
  }
  return {
    permanentUserData: {
      getUserByClientId: (client) => users.get(client) ?? UNRECORDED_EDITOR,
      getUserByDeletedId: (id) => {
        for (const [key, ds] of dss) if (Y.isDeleted(ds, id)) return key;
        return UNRECORDED_EDITOR;
      },
      dss,
    },
    colorMapping,
    // Only ever reached for a user with no colour: there is none, every user above has one.
    colors: [def(VERSION_UNRECORDED_COLOUR)],
  };
}
