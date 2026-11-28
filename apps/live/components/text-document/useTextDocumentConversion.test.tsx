// @vitest-environment jsdom

// docs/specs/034-text-documents/standard-mapping.md "Conversion", files-and-print.md "Downloading": the own format
// downloads at once; the other asks first, listing what it cannot hold; Convert is an Editor's, one undo step.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Body, TextDocumentState } from '@livedoc/text-documents';
import type { TextDocumentFormat } from '@livedoc/document';
import { track } from '@/lib/telemetry';
import {
  CONVERT_FAILED,
  NOT_READY,
  useTextDocumentConversion,
  type TextDocumentConversionDeps,
} from './useTextDocumentConversion';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function Harness(props: TextDocumentConversionDeps & { onDoors: (d: Doors) => void }) {
  const { onDoors, ...deps } = props;
  const doors = useTextDocumentConversion(deps);
  onDoors(doors);
  return <>{doors.dialog}</>;
}

type Doors = ReturnType<typeof useTextDocumentConversion>;

function setUp(overrides: Partial<TextDocumentConversionDeps> = {}) {
  const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Hello'))]);
  const undoManager = new Y.UndoManager([
    TextDocumentState.body(doc),
    TextDocumentState.stylesType(doc),
  ]);
  const deps = {
    format: 'odf' as TextDocumentFormat,
    doc: () => doc,
    undoManager: () => undoManager,
    setFormat: vi.fn(),
    download: vi.fn(),
    setProblem: vi.fn(),
    ...overrides,
  };
  let doors: Doors | null = null;
  render(<Harness {...deps} onDoors={(d) => (doors = d)} />);
  return { deps, doc, undoManager, doors: () => doors! };
}

describe('useTextDocumentConversion', () => {
  it('downloads the document’s own format at once', () => {
    const { deps, doors } = setUp();
    act(() => doors().download('fodt'));
    expect(deps.download).toHaveBeenCalledWith('fodt');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before downloading the other format, then downloads its converted copy', () => {
    const { deps, doors } = setUp();
    act(() => doors().download('docx'));
    expect(screen.getByRole('dialog', { name: 'Download as Word?' })).toBeTruthy();
    expect(screen.getByText('Everything in this document fits the Word format.')).toBeTruthy();
    expect(deps.download).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    });
    expect(deps.download).toHaveBeenCalledWith('docx');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('converts on Convert, naming the new format, as one undo step', () => {
    const { deps, doc, undoManager, doors } = setUp();
    act(() => doors().convert!());
    expect(screen.getByRole('dialog', { name: 'Convert to Word?' })).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
    });
    expect(deps.setFormat).toHaveBeenCalledWith('ooxml');
    expect(track).toHaveBeenCalledWith('Document', 'Changed', 'TextDocumentConverted');
    expect(TextDocumentState.styles(doc, 'ooxml').some((s) => s.id === 'Normal')).toBe(true);
    act(() => {
      undoManager.undo();
    });
    expect(deps.setFormat).toHaveBeenLastCalledWith('odf');
  });

  it('converts an OOXML document to OpenDocument', () => {
    const doc = TextDocumentState.load([TextDocumentState.fromBody(Body.of('Hi'))]);
    const { deps, doors } = setUp({ format: 'ooxml', doc: () => doc });
    act(() => doors().convert!());
    expect(screen.getByRole('dialog', { name: 'Convert to OpenDocument?' })).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
    });
    expect(deps.setFormat).toHaveBeenCalledWith('odf');
  });

  it('leaves everything on Cancel', () => {
    const { deps, doors } = setUp();
    act(() => doors().convert!());
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deps.setFormat).not.toHaveBeenCalled();
  });

  it('offers no conversion to someone who may not convert', () => {
    const { doors } = setUp({ setFormat: null });
    expect(doors().convert).toBeNull();
  });

  it('says the document is still loading when it is', () => {
    const { deps, doors } = setUp({ doc: () => null });
    act(() => doors().download('docx'));
    expect(deps.setProblem).toHaveBeenCalledWith(NOT_READY);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says the writing is not bound yet when Convert comes before it', () => {
    const { deps, doors } = setUp({ undoManager: () => null });
    act(() => doors().convert!());
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
    });
    expect(deps.setProblem).toHaveBeenLastCalledWith(NOT_READY);
    expect(deps.setFormat).not.toHaveBeenCalled();
  });

  it('says a conversion that fails, and changes nothing', () => {
    const { deps, doors } = setUp();
    const spy = vi.spyOn(TextDocumentState, 'convert').mockImplementation(() => {
      throw new Error('broken');
    });
    act(() => doors().convert!());
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
    });
    expect(deps.setProblem).toHaveBeenLastCalledWith(CONVERT_FAILED);
    expect(deps.setFormat).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
