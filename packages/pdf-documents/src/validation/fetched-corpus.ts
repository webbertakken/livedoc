// The wider corpus (corpus/README.md, docs/research/pdf-documents/corpus-and-validators.md): other projects' test
// files, fetched into a cache by scripts/fetch-pdf-corpus.sh and never committed, and the files made here from one of
// them with qpdf. What is expected of each is corpus/fetched.json. Validation only: nothing here ships.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spoiled } from '../testing/fixtures';

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Where the fetched corpus lives: `PDF_CORPUS_DIR`, else the user's cache. */
export const PDF_CORPUS_DIR =
  process.env.PDF_CORPUS_DIR ??
  join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'livedoc/pdf-corpus');
/** The tools fetched beside the files: the second renderer's packages. */
export const ORACLE_FOLDER = 'oracle';
const DERIVED_FOLDER = 'derived';
/** The paper the derived files are made from: 14 pages of text, pictures and formulas. */
const PAPER = 'text/tracemonkey.pdf';
const PAPER_PAGES = 14;
const TRUNCATED_BYTES = 600_000;

export type FetchedFile = {
  /** Its group and name: its path inside the cache, or `derived/` and the name of a file made here. */
  readonly file: string;
  /** How many pages it opens with; absent where it is refused. */
  readonly pages?: number;
  /** The named reason it is not opened. */
  readonly refusal?: string;
  /** Its open password. */
  readonly password?: string;
  /** Whether it opens only by being repaired, so it takes no addition. */
  readonly repaired?: boolean;
  /**
   * Where its first page differs from the second renderer's on 1% of its pixels or more: the measured share's
   * ceiling, in percent, and what differs. A file is named here, never the tolerance raised.
   */
  readonly differs?: { readonly under: number; readonly why: string };
  /** Why the second renderer draws no page of it to compare with. */
  readonly undrawn?: string;
};

type Expectations = {
  readonly groups: Readonly<Record<string, string>>;
  readonly files: readonly FetchedFile[];
};

const expectations = JSON.parse(
  readFileSync(join(PACKAGE, 'corpus/fetched.json'), 'utf8'),
) as Expectations;

/** Every file of the wider corpus, as the expectations name them. */
export const fetchedFiles = (): readonly FetchedFile[] => expectations.files;

/** What a group of the corpus holds, as the research found it. */
export const groupOf = (file: FetchedFile): string =>
  expectations.groups[file.file.split('/')[0]!] ?? '';

/** Fetches what is missing of the corpus and the second renderer (a no-op when all is there and checks out). */
export function fetchPdfCorpus(): void {
  execFileSync('bash', [join(PACKAGE, 'scripts/fetch-pdf-corpus.sh')], {
    stdio: 'pipe',
    env: { ...process.env, PDF_CORPUS_DIR },
  });
}

/** The files the cache holds, each as its group and name. */
export const fetchedNames = (): string[] =>
  readdirSync(PDF_CORPUS_DIR)
    .filter((group) => group !== ORACLE_FOLDER)
    .flatMap((group) => readdirSync(join(PDF_CORPUS_DIR, group)).map((name) => `${group}/${name}`))
    .sort();

let derived: string | null = null;

/**
 * The files made here from the paper, each a way a real file arrives that no project's test files carry at a
 * paper's size: linearised, protected with AES-256 by an open password and by a permissions password alone, cut
 * short, its cross-reference pointer spoiled, and a thousand pages long. Made once a run, with qpdf.
 */
function derivedFolder(): string {
  if (derived) return derived;
  const folder = mkdtempSync(join(tmpdir(), 'livedoc-derived-pdf-'));
  const paper = join(PDF_CORPUS_DIR, PAPER);
  const qpdf = (...args: string[]) => execFileSync('qpdf', args, { stdio: 'pipe' });
  qpdf('--linearize', paper, join(folder, 'linearised.pdf'));
  qpdf('--encrypt', 'open', 'owner', '256', '--', paper, join(folder, 'aes256-open.pdf'));
  qpdf(
    ...['--encrypt', '', 'owner', '256', '--modify=none', '--'],
    ...[paper, join(folder, 'aes256-locked.pdf')],
  );
  const times = 1008 / PAPER_PAGES;
  qpdf(
    ...['--empty', '--pages', ...Array.from({ length: times }, () => [paper, '1-z']).flat(), '--'],
    join(folder, 'pages-1008.pdf'),
  );
  const bytes = readFileSync(paper);
  writeFileSync(join(folder, 'truncated.pdf'), bytes.subarray(0, TRUNCATED_BYTES));
  writeFileSync(join(folder, 'no-startxref.pdf'), spoiled(bytes));
  return (derived = folder);
}

/** Where a file of the wider corpus is on disk. */
export const fetchedPath = (file: FetchedFile): string =>
  file.file.startsWith(`${DERIVED_FOLDER}/`)
    ? join(derivedFolder(), file.file.slice(DERIVED_FOLDER.length + 1))
    : join(PDF_CORPUS_DIR, file.file);

export const fetchedBytes = (file: FetchedFile): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(fetchedPath(file)));
