import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_ENVELOPE_KIND,
  documentToEnvelopeText,
  parseDocumentEnvelope,
  type EnvelopeTab,
} from './document-envelope';

// The `.livedoc` file's contents (docs/specs/022-drive-mirror/drive-mirror.md, "The file").

const tab: EnvelopeTab = { id: 't1', name: 'Tab 1', elements: [], folder: 'Ideas' };

describe('documentToEnvelopeText', () => {
  it('wraps the document, its tabs with folders, and the deck in a livedoc.document envelope', () => {
    const text = documentToEnvelopeText(
      { id: 'd1', name: 'Plan', presentation: '{"slides":[]}' },
      [tab],
      42,
    );
    expect(JSON.parse(text)).toEqual({
      kind: DOCUMENT_ENVELOPE_KIND,
      schemaVersion: 1,
      exportedAt: 42,
      document: { id: 'd1', name: 'Plan', presentation: '{"slides":[]}', tabs: [tab] },
    });
  });

  it('is byte-identical for identical input, so md5 only moves when content does', () => {
    const a = documentToEnvelopeText({ id: 'd', name: 'n', presentation: null }, [tab], 1);
    const b = documentToEnvelopeText({ id: 'd', name: 'n', presentation: null }, [tab], 1);
    expect(a).toBe(b);
  });
});

describe('parseDocumentEnvelope', () => {
  it('round-trips', () => {
    const text = documentToEnvelopeText({ id: 'd1', name: 'Plan', presentation: null }, [tab], 7);
    const parsed = parseDocumentEnvelope(text);
    expect(parsed).toEqual({ ok: true, envelope: JSON.parse(text) as unknown });
  });

  it('names each failure', () => {
    expect(parseDocumentEnvelope('nope')).toEqual({ ok: false, failure: 'not_json' });
    expect(parseDocumentEnvelope('{"kind":"livedoc.tab","schemaVersion":1}')).toEqual({
      ok: false,
      failure: 'wrong_kind',
    });
    expect(parseDocumentEnvelope('{"kind":"livedoc.document","schemaVersion":2}')).toEqual({
      ok: false,
      failure: 'unsupported_version',
    });
    expect(
      parseDocumentEnvelope(
        '{"kind":"livedoc.document","schemaVersion":1,"document":{"id":"d","name":"n","tabs":[{"id":1}]}}',
      ),
    ).toEqual({ ok: false, failure: 'malformed' });
    expect(parseDocumentEnvelope('null')).toEqual({ ok: false, failure: 'malformed' });
  });

  it('reads a missing deck as none', () => {
    const parsed = parseDocumentEnvelope(
      '{"kind":"livedoc.document","schemaVersion":1,"exportedAt":1,"document":{"id":"d","name":"n","tabs":[]}}',
    );
    expect(parsed.ok && parsed.envelope.document.presentation).toBeNull();
  });
});

// docs/specs/029-sheets/sheet-store.md "Copies and exports": a spreadsheet's file carries its workbook row, so a copy
// read back from it is a spreadsheet.
describe('a spreadsheet in the envelope', () => {
  const workbook = { format: 'ods', settings: { locale: 'en-GB', timeZone: 'UTC' } };
  const sheet = { id: 'sheetAaa1', tabId: 't1', title: 'Sheet1' };

  it('carries the workbook row, and reads it back', () => {
    const text = documentToEnvelopeText(
      { id: 'd1', name: 'Budget', presentation: null },
      [tab],
      1,
      [],
      null,
      [sheet],
      workbook,
    );
    const read = parseDocumentEnvelope(text);
    expect(read.ok && read.envelope.document.workbook).toEqual(workbook);
  });

  it('carries none for another document, and leaves one that is not a workbook behind', () => {
    const plain = documentToEnvelopeText({ id: 'd1', name: 'Plan', presentation: null }, [tab], 1);
    const odd = JSON.parse(plain) as { document: Record<string, unknown> };
    expect(odd.document).not.toHaveProperty('workbook');
    odd.document.workbook = { format: 3 };
    const read = parseDocumentEnvelope(JSON.stringify(odd));
    expect(read.ok && read.envelope.document).not.toHaveProperty('workbook');
  });
});
