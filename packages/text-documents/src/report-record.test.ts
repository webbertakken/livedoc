import { describe, expect, it } from 'vitest';
import { ReportBuilder } from './report';
import {
  conversionRecordOf,
  importRecordOf,
  isEmptyReport,
  readConversionRecords,
  readImportRecord,
  REPORT_CONVERSIONS_MAX,
  REPORT_NAME_MAX,
  REPORT_NAMES_KEPT,
  withConversion,
  EMPTY_REPORT,
} from './report-record';

describe('report record', () => {
  it('keeps nothing for a read that dropped and kept nothing', () => {
    expect(importRecordOf('txt', new ReportBuilder().build())).toBeNull();
  });

  it('summarises a read by reason, counting every item and keeping the first names', () => {
    const report = new ReportBuilder();
    report.drop('macro', 'word/vbaProject.bin');
    report.drop('field', 'DDE', 2);
    report.drop('field', 'INCLUDETEXT');
    report.keep('customXml');
    report.keep('customXml');
    report.keep('sdt');
    expect(importRecordOf('docx', report.build())).toEqual({
      type: 'docx',
      dropped: [
        { reason: 'macro', count: 1, names: ['word/vbaProject.bin'], nameCount: 1 },
        { reason: 'field', count: 3, names: ['DDE', 'INCLUDETEXT'], nameCount: 2 },
      ],
      kept: { reason: 'kept', count: 3, names: ['customXml', 'sdt'], nameCount: 2 },
    });
  });

  it('keeps a few names, each cut short, whatever the file named', () => {
    const report = new ReportBuilder();
    for (let i = 0; i < 50; i += 1) report.drop('layout-hint', `${i}${'x'.repeat(200)}`);
    const [entry] = importRecordOf('odt', report.build())!.dropped;
    expect(entry!.names).toHaveLength(REPORT_NAMES_KEPT);
    expect(entry!.names.every((n) => n.length === REPORT_NAME_MAX)).toBe(true);
    expect(entry!.count).toBe(50);
  });

  it('records a conversion only when it lost something', () => {
    expect(conversionRecordOf('odf', 'ooxml', [])).toBeNull();
    expect(
      conversionRecordOf('odf', 'ooxml', [{ kind: 'between', name: 'between', count: 2 }]),
    ).toEqual({
      from: 'odf',
      to: 'ooxml',
      losses: [{ reason: 'between', count: 2, names: ['between'], nameCount: 1 }],
    });
  });

  it('keeps the newest conversions past the cap', () => {
    const record = conversionRecordOf('odf', 'ooxml', [{ kind: 'between', name: 'b', count: 1 }])!;
    let converted = withConversion([], { ...record, from: 'ooxml' });
    for (let i = 0; i < REPORT_CONVERSIONS_MAX; i += 1)
      converted = withConversion(converted, record);
    expect(converted).toHaveLength(REPORT_CONVERSIONS_MAX);
    expect(converted.every((c) => c.from === 'odf')).toBe(true);
  });

  it('says whether a report holds anything', () => {
    expect(isEmptyReport(EMPTY_REPORT)).toBe(true);
    const record = conversionRecordOf('odf', 'ooxml', [{ kind: 'between', name: 'b', count: 1 }])!;
    expect(isEmptyReport({ imported: null, converted: [record] })).toBe(false);
  });

  it('reads back what it stored', () => {
    const report = new ReportBuilder();
    report.drop('macro', 'm');
    const imported = importRecordOf('docm', report.build());
    expect(readImportRecord(JSON.parse(JSON.stringify(imported)))).toEqual(imported);
    const record = conversionRecordOf('ooxml', 'odf', [{ kind: 'kept', name: 'k', count: 1 }])!;
    expect(readConversionRecords([record])).toEqual([record]);
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'docx'],
    ['no type', { dropped: [], kept: null }],
    ['dropped not a list', { type: 'docx', dropped: {}, kept: null }],
    [
      'a bad entry',
      {
        type: 'docx',
        dropped: [{ reason: 'macro', count: 0, names: [], nameCount: 1 }],
        kept: null,
      },
    ],
    [
      'names not strings',
      {
        type: 'docx',
        dropped: [{ reason: 'macro', count: 1, names: [1], nameCount: 1 }],
        kept: null,
      },
    ],
    ['a bad kept', { type: 'docx', dropped: [], kept: { reason: 'kept' } }],
  ])('reads %s as no import record', (_, value) => {
    expect(readImportRecord(value)).toBeNull();
  });

  it('leaves out stored conversions not of the shape', () => {
    const good = { from: 'odf', to: 'ooxml', losses: [] };
    expect(readConversionRecords('x')).toEqual([]);
    expect(
      readConversionRecords([
        good,
        null,
        { from: 'pdf', to: 'odf', losses: [] },
        { from: 'odf', to: 'ooxml', losses: [{}] },
      ]),
    ).toEqual([good]);
  });
});
