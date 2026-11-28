// docs/specs/034-text-documents/files-and-print.md "Opening": a file opens as a text document in its format, a template
// or a macro-enabled Word file too; Plain Text and Markdown are imported into a new OpenDocument one; a refusal is
// worded for the person.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { track } from '@/lib/telemetry';
import { importedTypeOf, nameFromFile, openTextDocumentFile } from './open-text-document-file';

vi.mock('@/lib/api-client', async (real) => ({
  ...(await real<typeof import('@/lib/api-client')>()),
  apiCreateDocument: vi.fn(),
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const created = () =>
  vi.mocked(apiCreateDocument).mock.calls[0]![1] as {
    name: string;
    tabs: { format: string }[];
    textDocuments: { file: string; type?: string }[];
  };

describe('openTextDocumentFile', () => {
  it('opens a Word template as a Word text document, named after the file', async () => {
    vi.mocked(apiCreateDocument).mockResolvedValue({} as never);
    const opened = await openTextDocumentFile('me', new File(['x'], 'Letter.dotx'));
    expect(opened.ok).toBe(true);
    expect(created().name).toBe('Letter');
    expect(created().tabs[0]!.format).toBe('ooxml');
    expect(created().textDocuments[0]!.type).toBeUndefined();
    expect(track).toHaveBeenCalledWith('Tab', 'Imported', 'Dotx');
  });

  it('imports Markdown into a new OpenDocument text document', async () => {
    vi.mocked(apiCreateDocument).mockResolvedValue({} as never);
    await openTextDocumentFile('me', new File(['# Plan'], 'notes.md'));
    expect(created().tabs[0]!.format).toBe('odf');
    expect(created().textDocuments[0]).toMatchObject({ type: 'md', file: btoa('# Plan') });
    expect(track).toHaveBeenCalledWith('Tab', 'Imported', 'Md');
  });

  it('words a refusal for the person', async () => {
    vi.mocked(apiCreateDocument).mockRejectedValue(
      new ApiError('create document', 415, 'package_wrong_type'),
    );
    expect(await openTextDocumentFile('me', new File(['x'], 'a.txt'))).toEqual({
      ok: false,
      message: 'This file is not a text document LiveDoc can open yet.',
    });
    vi.mocked(apiCreateDocument).mockRejectedValue(new Error('offline'));
    expect(await openTextDocumentFile('me', new File(['x'], 'a.txt'))).toEqual({
      ok: false,
      message: 'The file could not be opened. Try again.',
    });
  });
});

describe('importedTypeOf', () => {
  it('names each file by its extension, an OpenDocument one by default', () => {
    expect(
      [
        'a.odt',
        'b.fodt',
        'c.ott',
        'd.DOCX',
        'e.dotx',
        'f.docm',
        'g.txt',
        'h.markdown',
        'i.htm',
      ].map(importedTypeOf),
    ).toEqual(['Odt', 'Odt', 'Ott', 'Docx', 'Dotx', 'Docm', 'Txt', 'Md', 'Html']);
  });
});

describe('nameFromFile', () => {
  it('drops the extension, and names a nameless file Untitled document', () => {
    expect(nameFromFile('Q3 report.docx')).toBe('Q3 report');
    expect(nameFromFile('.md')).toBe('Untitled document');
  });
});
