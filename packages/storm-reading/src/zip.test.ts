import { describe, expect, it } from 'vitest';
import { buildExportBundle } from './bundle';
import { readBoard } from './reading';
import { board } from './testing';
import {
  DOMAIN_EXPORT_MAX_PREVIOUS_BYTES,
  DOMAIN_EXPORT_MAX_WRITTEN_FILES,
  ZIP_BUNDLE_FOLDER,
  parseWrittenFiles,
  previousExport,
  writeMessages,
  zipFiles,
} from './zip';

// The zip (docs/specs/021-event-storming/domain-export.md "The zip"): the earlier zip read back, the model's
// messages and answer, and the layout the editor writes.

const reading = readBoard(board({ id: 'e1', kind: 'domain-event', col: 0, words: 'Order placed' }));
const bundle = (language: 'typescript' | null = 'typescript') =>
  buildExportBundle({
    reading,
    previous: null,
    language,
    because: 'chosen in the export dialog',
    board: { documentId: 'd', tabId: 't', name: 'Orders', rev: 3 },
    livedoc: 'web',
    exportedAt: '2026-11-11T00:00:00.000Z',
  });

describe('previousExport', () => {
  it('reads the baseline, the manifest and the spec and code an earlier zip holds', () => {
    const b = bundle();
    const prev = previousExport({
      'README.md': 'readme',
      [`${ZIP_BUNDLE_FOLDER}/storm.json`]: b.files['storm.json']!,
      [`${ZIP_BUNDLE_FOLDER}/export.json`]: b.files['export.json']!,
      [`${ZIP_BUNDLE_FOLDER}/storm.md`]: 'view',
      [`${ZIP_BUNDLE_FOLDER}/trace.json`]: '{"e1":"Order"}',
      'docs/specs/README.md': '# Orders',
      'src/orders/order.ts': 'export type Order = {}',
    });
    expect(prev.ok).toBe(true);
    if (!prev.ok) return;
    expect(prev.reading.notes).toHaveLength(1);
    expect(prev.manifest?.language).toBe('typescript');
    expect(Object.keys(prev.sources)).toEqual([
      `${ZIP_BUNDLE_FOLDER}/trace.json`,
      'docs/specs/README.md',
      'src/orders/order.ts',
    ]);
  });

  it('refuses a zip without the baseline', () => {
    expect(previousExport({ 'src/a.ts': 'x' })).toEqual({ ok: false, error: 'previous_invalid' });
    expect(previousExport({ [`${ZIP_BUNDLE_FOLDER}/storm.json`]: '{"schema":"other"}' })).toEqual({
      ok: false,
      error: 'previous_invalid',
    });
  });

  it('refuses an earlier export past its size', () => {
    const b = bundle();
    const big = 'x'.repeat(DOMAIN_EXPORT_MAX_PREVIOUS_BYTES);
    expect(
      previousExport({
        [`${ZIP_BUNDLE_FOLDER}/storm.json`]: b.files['storm.json']!,
        'src/big.ts': big,
      }),
    ).toEqual({ ok: false, error: 'previous_too_large' });
  });

  it('reads a zip without a manifest', () => {
    const prev = previousExport({
      [`${ZIP_BUNDLE_FOLDER}/storm.json`]: bundle().files['storm.json']!,
    });
    expect(prev.ok && prev.manifest).toBeNull();
  });
});

describe('writeMessages', () => {
  it('hands the model the brief and an answer format, then the bundle', () => {
    const [system, user] = writeMessages(bundle(), {});
    expect(system!.role).toBe('system');
    expect(system!.content).toContain('# Convert an Event Storming board');
    expect(system!.content).toContain('## Answer format');
    expect(user!.content).toContain('## storm.json');
    expect(user!.content).toContain('Order placed');
    expect(user!.content).not.toContain('## Earlier export');
  });

  it('hands over the earlier export’s spec and code to change rather than replace', () => {
    const [, user] = writeMessages(bundle(), { 'src/orders/order.ts': 'export type Order = {}' });
    expect(user!.content).toContain('## Earlier export');
    expect(user!.content).toContain('### src/orders/order.ts');
  });
});

describe('parseWrittenFiles', () => {
  it('reads the files of a JSON answer, fenced or not', () => {
    const answer = JSON.stringify({
      files: [
        { path: 'docs/specs/README.md', content: '# Orders\n' },
        { path: `${ZIP_BUNDLE_FOLDER}/trace.json`, content: '{}' },
      ],
    });
    expect(parseWrittenFiles(answer)).toEqual({
      ok: true,
      files: {
        'docs/specs/README.md': '# Orders\n',
        [`${ZIP_BUNDLE_FOLDER}/trace.json`]: '{}',
      },
      dropped: [],
    });
    expect(parseWrittenFiles('```json\n' + answer + '\n```').ok).toBe(true);
    expect(parseWrittenFiles('```' + answer + '```').ok).toBe(true);
    expect(parseWrittenFiles('```')).toEqual({ ok: false });
  });

  it('drops every path outside the spec and the source tree', () => {
    const answer = JSON.stringify({
      files: [
        { path: '../escape.ts', content: 'x' },
        { path: '/etc/passwd', content: 'x' },
        { path: 'C:\\win.ts', content: 'x' },
        { path: `${ZIP_BUNDLE_FOLDER}/storm.json`, content: 'x' },
        { path: 'README.md', content: 'x' },
        { path: 'src/./ok.ts', content: 'x' },
        { path: '', content: 'x' },
        { content: 'no path' },
        { path: 'src/ok.ts', content: 7 },
        { path: 'src/good.ts', content: 'ok' },
      ],
    });
    const parsed = parseWrittenFiles(answer);
    expect(parsed.ok && parsed.files).toEqual({ 'src/good.ts': 'ok' });
    expect(parsed.ok && parsed.dropped).toHaveLength(9);
  });

  it('keeps at most the written-file cap', () => {
    const files = Array.from({ length: DOMAIN_EXPORT_MAX_WRITTEN_FILES + 5 }, (_, i) => ({
      path: `src/f${i}.ts`,
      content: '',
    }));
    const parsed = parseWrittenFiles(JSON.stringify({ files }));
    expect(parsed.ok && Object.keys(parsed.files)).toHaveLength(DOMAIN_EXPORT_MAX_WRITTEN_FILES);
  });

  it('refuses an answer that is no such JSON', () => {
    expect(parseWrittenFiles('I could not do it')).toEqual({ ok: false });
    expect(parseWrittenFiles('{"files": "nope"}')).toEqual({ ok: false });
    expect(parseWrittenFiles('null')).toEqual({ ok: false });
    expect(parseWrittenFiles(JSON.stringify({ files: [] }))).toEqual({ ok: false });
  });
});

describe('zipFiles', () => {
  it('lays out the bundle under livedoc/ with the written spec and types beside it', () => {
    const files = zipFiles(bundle(), { 'docs/specs/README.md': '# Orders' });
    expect(Object.keys(files)).toEqual([
      'README.md',
      `${ZIP_BUNDLE_FOLDER}/storm.json`,
      `${ZIP_BUNDLE_FOLDER}/storm.md`,
      `${ZIP_BUNDLE_FOLDER}/CONVERT.md`,
      `${ZIP_BUNDLE_FOLDER}/export.json`,
      'docs/specs/README.md',
    ]);
    expect(files['README.md']).toContain('written by');
    expect(files['README.md']).toContain('Orders');
    expect(files['README.md']).toContain('the TypeScript types');
  });

  it('names an unnamed board and a language the agent chose plainly', () => {
    const b = bundle(null);
    const unnamed = { ...b, manifest: { ...b.manifest, board: { ...b.manifest.board, name: '' } } };
    const readme = zipFiles(unnamed, { 'src/a.ts': '' })['README.md']!;
    expect(readme).toContain('# Event Storming board: domain export');
    expect(readme).toContain('the spec and the types');
  });

  it('says to hand CONVERT.md to a coding agent when nothing was written', () => {
    const files = zipFiles(bundle(null), null);
    expect(files['README.md']).toContain('Hand `livedoc/CONVERT.md` to a coding agent');
    expect(files['README.md']).not.toContain('written by');
  });
});
