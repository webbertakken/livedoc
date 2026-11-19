import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readTextDocumentFile, writeTextDocumentFile } from './files';
import { TextDocument } from './model/text-document';
import { wholeOf } from './testing/compare';

const CORPUS = join(import.meta.dirname, '..', 'corpus');

const files = ['libreoffice', 'word'].flatMap((maker) =>
  readdirSync(join(CORPUS, maker))
    .filter(
      (f) =>
        /\.(odt|fodt|docx)$/.test(f) && !f.startsWith('encrypted') && !f.endsWith('-source.fodt'),
    )
    .map((f) => join(maker, f)),
);

/** The structure a file must read as: its paragraphs, their styles and lists, and what it kept. */
function structure(document: TextDocument) {
  return {
    format: document.format,
    paragraphs: document.body.map((b) =>
      b.type === 'paragraph'
        ? [
            b.style,
            b.list ? `${b.list.level}${b.list.checked ? '☑' : ''}` : '',
            TextDocument.paragraphTexts({ ...document, body: [b] })[0],
            b.inlines
              .filter((i) => i.type === 'kept')
              .map((i) => i.name)
              .join(','),
          ]
        : b.type === 'kept'
          ? ['kept', b.name]
          : ['section', b.start, b.setup.orientation],
    ),
    roles: document.styles.filter((s) => s.role).map((s) => `${s.role}=${s.id}`),
    lists: Object.keys(document.lists).length,
  };
}

// docs/specs/034-text-documents/standard-mapping.md "The rule", office-packages.md "Validation": files made by
// LibreOffice and Word read as they must, and come back the same document when written in their own format.
describe('the corpus', () => {
  for (const file of files)
    it(`reads ${file} and writes it back the same`, async () => {
      const read = await readTextDocumentFile(readFileSync(join(CORPUS, file)));
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect({ structure: structure(read.document), report: read.report }).toMatchSnapshot();
      const written = writeTextDocumentFile(read.document, read.fileType);
      expect(written.ok).toBe(true);
      if (!written.ok) return;
      const again = await readTextDocumentFile(written.bytes);
      const a = again.ok ? wholeOf(again.document) : 'refused';
      const b = wholeOf(read.document);
      if (a !== b && process.env.DIFF) {
        let i = 0;
        while (a[i] === b[i]) i++;
        console.log(
          file,
          b.slice(Math.max(0, i - 250), i + 150),
          '\n VS \n',
          a.slice(Math.max(0, i - 250), i + 150),
        );
      }
      expect(a).toBe(b);
    });

  it('refuses a password-protected Word file', async () => {
    const read = await readTextDocumentFile(
      readFileSync(join(CORPUS, 'word', 'encrypted-password-is-pass.docx')),
    );
    expect(read).toEqual({ ok: false, rejection: 'package_encrypted' });
  });
});
