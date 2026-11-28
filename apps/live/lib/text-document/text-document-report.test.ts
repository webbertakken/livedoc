// docs/specs/034-text-documents/files-and-print.md "Import report": once, what reading the file dropped and kept;
// Security limitations, that and each conversion newest first, or the sentence for nothing.
import { describe, expect, it } from 'vitest';
import { EMPTY_REPORT, REPORT_EMPTY, type TextDocumentReport } from '@livedoc/text-documents';
import { openedReportView, securityLimitationsView } from './text-document-report';

const REPORT: TextDocumentReport = {
  imported: {
    type: 'html',
    dropped: [{ reason: 'active-content', count: 1, names: ['script'], nameCount: 1 }],
    kept: null,
  },
  converted: [
    {
      from: 'odf',
      to: 'ooxml',
      losses: [{ reason: 'between', count: 1, names: ['between'], nameCount: 1 }],
    },
    {
      from: 'ooxml',
      to: 'odf',
      losses: [{ reason: 'kept', count: 2, names: ['a', 'b'], nameCount: 2 }],
    },
  ],
};

describe('the text document report views', () => {
  it('shows nothing once when the file dropped and kept nothing', () => {
    expect(openedReportView(EMPTY_REPORT, 'Notes')).toBeNull();
  });

  it('shows nothing once for housekeeping alone', () => {
    const quiet: TextDocumentReport = {
      imported: {
        type: 'odt',
        dropped: [{ reason: 'thumbnail', count: 1, names: ['t'], nameCount: 1 }],
        kept: { reason: 'kept', count: 1, names: ['sequence-decls'], nameCount: 1 },
      },
      converted: [],
    };
    expect(openedReportView(quiet, 'Notes')).toBeNull();
    expect(securityLimitationsView(quiet).sections).toHaveLength(1);
  });

  it('shows the Opened lines once, titled by the document', () => {
    expect(openedReportView(REPORT, 'Page')).toEqual({
      title: 'Opened “Page”',
      sections: [
        {
          lead: 'Some of what the file held is not in the document:',
          lines: ['1 script, frame or control left out, never run: script'],
        },
      ],
    });
  });

  it('lists Opened, then each conversion newest first, in Security limitations', () => {
    const view = securityLimitationsView(REPORT);
    expect(view.title).toBe('Security limitations');
    expect(view.sections.map((s) => s.heading)).toEqual([
      'Opened from a .html file',
      'Converted to OpenDocument',
      'Converted to Word',
    ]);
    expect(view.sections[1]!.lines).toEqual(['2 items kept from the original file: a and b']);
    expect(securityLimitationsView(EMPTY_REPORT)).toEqual({
      title: 'Security limitations',
      sections: [],
      empty: REPORT_EMPTY,
    });
  });
});
