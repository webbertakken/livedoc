// docs/specs/035-pdf-documents/reading-surface.md "Notices": one bar, the notices queued in the table's order;
// opening.md "Damaged files": the repaired notice, its second sentence where the mode can change the PDF.
import { describe, expect, it } from 'vitest';
import { PdfPermissions } from '@livedoc/pdf-documents';
import { PDF_REPAIRED_COPY, pdfFileNotices } from './pdf-notices';

const NO_COPY = { ...PdfPermissions.all(), copy: false };

describe('pdfFileNotices', () => {
  it('queues the repaired notice before the permissions notice', () => {
    expect(
      pdfFileNotices({ repaired: true, permissions: NO_COPY, canChange: false }).map(
        (notice) => notice.id,
      ),
    ).toEqual(['repaired', 'limits']);
  });

  it('says a repaired file is saved as a repaired copy only where the mode can change it', () => {
    const [viewing] = pdfFileNotices({
      repaired: true,
      permissions: PdfPermissions.all(),
      canChange: false,
    });
    expect(viewing).toEqual({
      id: 'repaired',
      sentence:
        'This PDF was damaged. LiveDoc repaired it to show it; the file itself is unchanged.',
      action: 'Details',
    });
    const [changing] = pdfFileNotices({
      repaired: true,
      permissions: PdfPermissions.all(),
      canChange: true,
    });
    expect(changing!.sentence).toBe(
      'This PDF was damaged. LiveDoc repaired it to show it; the file itself is unchanged. Changes to this PDF are saved as a repaired copy.',
    );
  });

  it('has nothing to say of a sound file that asks nothing', () => {
    expect(
      pdfFileNotices({ repaired: false, permissions: PdfPermissions.all(), canChange: true }),
    ).toEqual([]);
    expect(pdfFileNotices({ repaired: false, permissions: NO_COPY, canChange: true })).toEqual([
      {
        id: 'limits',
        sentence: 'This PDF limits what can be done with it.',
        action: 'Enter permissions password',
      },
    ]);
  });
});

describe('the repaired PDF’s Details', () => {
  it('names what was rebuilt, and how changes are saved', () => {
    expect(PDF_REPAIRED_COPY.title).toBe('Repaired PDF');
    expect(PDF_REPAIRED_COPY.rebuilt).toBe(
      "LiveDoc rebuilt this PDF's index of where each part of the file lies, to show it. The file itself is unchanged.",
    );
    expect(PDF_REPAIRED_COPY.saved).toBe(
      'Changes are saved as a repaired copy: the whole file written anew, never added to its end.',
    );
  });
});
