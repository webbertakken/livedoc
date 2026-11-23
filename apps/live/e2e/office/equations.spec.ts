import { readFileSync, writeFileSync } from 'node:fs';
import {
  readTextDocumentFile,
  TextDocument,
  writeTextDocumentFile,
  type Equation,
  type MathNode,
  type MathRow,
} from '@livedoc/text-documents';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Equations (docs/specs/034-text-documents/objects.md "Equations in the editor", "Equations in the formats"): a Word
// file's equations are drawn as MathML in line, a fraction's numerator over its denominator, one alone on its line
// centred; a press puts the caret in its box, where typing and shortcuts write; the file leaves holding the maths.

const BODY = '[role="textbox"][aria-label="Document body"]';
const id = (text: string): MathNode => ({ kind: 'identifier', text });
const num = (text: string): MathNode => ({ kind: 'number', text });
const op = (text: string): MathNode => ({ kind: 'operator', text });
const INLINE: MathRow = [
  { kind: 'fraction', numerator: [id('a')], denominator: [id('b'), op('+'), num('1')] },
  op('+'),
  { kind: 'scripts', base: [id('x')], sup: [num('2')] },
  op('≤'),
  { kind: 'root', radicand: [id('z')] },
];
const HALF: MathNode = { kind: 'fraction', numerator: [num('1')], denominator: [num('2')] };
const DISPLAY: MathRow = [
  {
    kind: 'large-operator',
    operator: '∑',
    lower: [id('k'), op('='), num('1')],
    upper: [id('n')],
    body: [id('k')],
  },
];

/** A Word file of a paragraph holding an equation and a paragraph of one equation alone. */
function mathsFile(path: string): void {
  const blank = TextDocument.blank({ format: 'ooxml', title: 'Maths' });
  const first = blank.body[0]!;
  if (first.type !== 'paragraph') throw new Error('no paragraph');
  const equation = (math: MathRow): Equation => ({ type: 'equation', math, props: {} });
  const body = [
    {
      ...first,
      inlines: [
        { type: 'run' as const, text: 'Where ', props: {} },
        equation(INLINE),
        { type: 'run' as const, text: ' holds.', props: {} },
      ],
    },
    { ...first, props: { align: 'center' as const }, inlines: [equation(DISPLAY)] },
  ];
  const written = writeTextDocumentFile({ ...blank, body }, 'docx');
  if (!written.ok) throw new Error(written.rejection);
  writeFileSync(path, written.bytes);
}

test('a Word file’s equations are drawn as maths, and leave as they came', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  const file = test.info().outputPath('Maths.docx');
  mathsFile(file);
  await page.goto('/new?kind=text-document');
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();

  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(file);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Maths');
  const body = page.locator(BODY);

  // Drawn as MathML in line: the fraction's numerator stands over its denominator, the text runs on either side.
  const equations = body.locator('.text-document-equation');
  await expect(equations).toHaveCount(2);
  await expect(body.locator('p').first()).toContainText('Where');
  const fraction = equations.first().locator('mfrac');
  await expect(fraction).toHaveCount(1);
  const [numerator, denominator] = await Promise.all([
    fraction.locator(':scope > mrow').nth(0).boundingBox(),
    fraction.locator(':scope > mrow').nth(1).boundingBox(),
  ]);
  expect(numerator!.y + numerator!.height).toBeLessThanOrEqual(denominator!.y + 1);
  // The sum alone on its line stands centred in it.
  const line = await body.locator('p').nth(1).boundingBox();
  const sum = await equations.nth(1).boundingBox();
  expect(Math.abs(sum!.x + sum!.width / 2 - (line!.x + line!.width / 2))).toBeLessThan(4);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('equations-open.png') });

  // A press puts the caret in the equation's box, at its end; typing writes there, shortcuts on the space after them.
  await equations.first().click();
  await expect(equations.first()).toHaveAttribute('data-editing', 'true');
  await expect(equations.first().locator('.text-document-equation-caret')).toHaveCount(1);
  await page.keyboard.type('+\\alpha \\frac 1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('2');
  await expect(equations.first().locator('mi', { hasText: 'α' })).toHaveCount(1);
  await expect(equations.first().locator('mfrac')).toHaveCount(2);
  // The caret stands after the 2 it just wrote, in the new fraction's denominator.
  const [caret, two] = await Promise.all([
    equations.first().locator('.text-document-equation-caret').boundingBox(),
    equations.first().locator('mfrac').nth(1).locator('mn', { hasText: '2' }).boundingBox(),
  ]);
  expect(caret!.height).toBeGreaterThan(0);
  expect(Math.abs(caret!.x - (two!.x + two!.width))).toBeLessThan(2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('equations-writing.png') });
  // Escape leaves the box, the caret in the text after it.
  await page.keyboard.press('Escape');
  await expect(equations.first()).not.toHaveAttribute('data-editing', 'true');

  // Downloaded, the same maths.
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'Microsoft Word (.docx)']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  const saved = test.info().outputPath('Maths-left.docx');
  await download.saveAs(saved);
  const left = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(left.ok).toBe(true);
  if (left.ok) {
    const maths = left.document.body.flatMap((b) =>
      b.type === 'paragraph'
        ? b.inlines.flatMap((i) => (i.type === 'equation' ? [i.math] : []))
        : [],
    );
    expect(maths).toEqual([[...INLINE, op('+'), id('α'), HALF], DISPLAY]);
  }
  expectNoPageErrors(pageErrors);
});
