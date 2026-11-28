import { describe, expect, it } from 'vitest';
import { ReportBuilder, type DroppedReason } from './report';
import { conversionRecordOf, importRecordOf } from './report-record';
import {
  convertedHeading,
  convertedLines,
  NAMED_REASONS,
  openedHeading,
  openedLines,
  openedTitle,
  REPORT_LINES,
} from './report-copy';

const opened = (build: (report: ReportBuilder) => void) => {
  const report = new ReportBuilder();
  build(report);
  return importRecordOf('docx', report.build())!;
};

describe('report copy', () => {
  it.each(Object.keys(REPORT_LINES) as DroppedReason[])('words %s, one and many', (reason) => {
    const [one, many] = REPORT_LINES[reason];
    expect(one.length).toBeGreaterThan(0);
    expect(many).not.toBe(one);
    expect(openedLines(opened((r) => r.drop(reason, 'X', 2)))).toEqual([
      NAMED_REASONS.has(reason) ? `2 ${many}: X` : `2 ${many}`,
    ]);
  });

  it('names up to three of a kind and counts the rest', () => {
    const lines = openedLines(
      opened((r) =>
        ['DDE', 'DDEAUTO', 'LINK', 'INCLUDETEXT', 'INCLUDEPICTURE'].forEach((n) =>
          r.drop('field', n),
        ),
      ),
    );
    expect(lines).toEqual([
      '5 fields that run or fetch things kept as their text: DDE, DDEAUTO, LINK and 2 more',
    ]);
  });

  it('puts kept content first, then the drops in the order they came', () => {
    const lines = openedLines(
      opened((r) => {
        r.drop('macro', 'word/vbaProject.bin');
        r.keep('customXml');
        r.drop('link', 'link');
      }),
    );
    expect(lines).toEqual([
      '1 item kept untouched from the file: customXml',
      '1 macro left out, never run: word/vbaProject.bin',
      '1 unsafe link kept as its text',
    ]);
  });

  it('heads and titles the report', () => {
    expect(openedTitle('Plan')).toBe('Opened “Plan”');
    expect(openedHeading(opened((r) => r.drop('macro', 'm')))).toBe('Opened from a .docx file');
    const record = conversionRecordOf('odf', 'ooxml', [{ kind: 'between', name: 'b', count: 2 }])!;
    expect(convertedHeading(record)).toBe('Converted to Word');
    expect(convertedHeading({ ...record, to: 'odf' })).toBe('Converted to OpenDocument');
    expect(convertedLines(record)).toEqual(['2 lines between paragraphs']);
  });
});
