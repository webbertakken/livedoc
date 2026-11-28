import { describe, expect, it } from 'vitest';
import { ReportBuilder } from '../report';
import { importRecordOf, REPORT_CONVERSIONS_MAX } from '../report-record';
import { TextDocumentState } from '../text-document-state';
import { TextDocument } from '../model/text-document';
import { REPORT_MAP } from './live-names';
import { appendLiveConversion } from './live-report';

const opened = () => {
  const report = new ReportBuilder();
  report.drop('active-content', 'script', 2);
  return importRecordOf('html', report.build())!;
};

describe('the live import report', () => {
  it('is empty in a state that never had one', () => {
    expect(TextDocumentState.report(TextDocumentState.load())).toEqual({
      imported: null,
      converted: [],
    });
  });

  it('holds what the room wrote with the document', () => {
    const doc = TextDocumentState.load([
      TextDocumentState.fromDocument(TextDocument.blank(), opened()),
    ]);
    expect(TextDocumentState.report(doc)).toEqual({ imported: opened(), converted: [] });
  });

  it('reads a value not of the shape as nothing', () => {
    const doc = TextDocumentState.load();
    doc.getMap(REPORT_MAP).set('imported', 'docx');
    doc.getMap(REPORT_MAP).set('converted', 3);
    expect(TextDocumentState.report(doc)).toEqual({ imported: null, converted: [] });
  });

  it('keeps the newest conversions', () => {
    const doc = TextDocumentState.load();
    const record = { from: 'odf', to: 'ooxml', losses: [] } as const;
    for (let i = 0; i <= REPORT_CONVERSIONS_MAX; i += 1) appendLiveConversion(doc, record);
    expect(TextDocumentState.report(doc).converted).toHaveLength(REPORT_CONVERSIONS_MAX);
  });

  it('records nothing for a conversion that lost nothing', () => {
    const doc = TextDocumentState.load([TextDocumentState.fromDocument(TextDocument.blank())]);
    expect(TextDocumentState.convert(doc, 'odf', 'ooxml')).toEqual([]);
    expect(TextDocumentState.report(doc).converted).toEqual([]);
  });
});
