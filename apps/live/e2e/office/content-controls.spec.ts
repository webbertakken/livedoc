import { writeFileSync } from 'node:fs';
import { TextDocument, writeTextDocumentFile } from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// docs/specs/034-text-documents/standard-mapping.md "Shown as it reads": smart chips are left out (C3); a content
// control in an arriving Word file (a date picker, a dropdown, a chip) shows its text, read only, kept whole.

const BODY = '[role="textbox"][aria-label="Document body"]';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function controlFile(path: string): void {
  const blank = TextDocument.blank({ format: 'ooxml', title: 'Chips' });
  const first = blank.body[0]!;
  if (first.type !== 'paragraph') throw new Error('no paragraph');
  const xml =
    '<w:sdt><w:sdtPr><w:date w:fullDate="2026-11-24T00:00:00Z"/></w:sdtPr>' +
    '<w:sdtContent><w:r><w:t>Nov 24, 2026</w:t></w:r></w:sdtContent></w:sdt>';
  const body = [
    {
      ...first,
      inlines: [
        { type: 'run' as const, text: 'Due ', props: {} },
        { type: 'kept' as const, name: 'sdt', xml: { xml, ns: { w: W } }, props: {} },
        { type: 'run' as const, text: ' at noon', props: {} },
      ],
    },
  ];
  const written = writeTextDocumentFile({ ...blank, body }, 'docx');
  writeFileSync(path, written.bytes);
}

test('a Word content control shows its text, read only', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  const file = test.info().outputPath('Chips.docx');
  controlFile(file);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chips');

  const body = page.locator(BODY);
  await expect(body.locator('p').first()).toHaveText('Due Nov 24, 2026 at noon');
  const control = body.locator('.text-document-kept-text');
  await expect(control).toHaveText('Nov 24, 2026');
  await expect(control).toHaveAttribute('contenteditable', 'false');
  await expect(body.locator('.text-document-kept')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
