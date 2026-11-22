// The corpus in the repository (corpus/README.md): files other software made, each with what the manifest says of it.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type CorpusFile = {
  /** Its path inside the corpus folder. */
  readonly file: string;
  readonly holds: string;
  readonly sha256: string;
  readonly bytes: number;
  /** How many pages it opens with; absent where it is refused. */
  readonly pages?: number;
  /** The named reason it is not opened. */
  readonly refusal?: string;
  /** Its open password. */
  readonly password?: string;
  /** Whether it opens only by being repaired, so its changes are written as a rewritten file. */
  readonly repaired?: boolean;
};

type Manifest = { readonly folder: string; readonly files: readonly CorpusFile[] };

const ROOT = fileURLToPath(new URL('../../corpus/', import.meta.url));
const manifest = JSON.parse(readFileSync(`${ROOT}manifest.json`, 'utf8')) as Manifest;

/** Every file of the repository's corpus, as the manifest names them. */
export const corpusFiles = (): readonly CorpusFile[] => manifest.files;

/** A corpus file's bytes, read afresh. */
export const corpusBytes = (file: CorpusFile): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(`${ROOT}${manifest.folder}/${file.file}`));
