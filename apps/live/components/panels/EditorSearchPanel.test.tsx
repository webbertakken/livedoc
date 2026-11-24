// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The panel itself is lazy (next/dynamic); a stub captures the props the editor wires.
const panelProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('next/dynamic', () => ({
  default: () => (props: Record<string, unknown>) => {
    panelProps.current = props;
    return null;
  },
}));
const ctx = vi.hoisted(() => ({ setActiveId: vi.fn(), setSelectedId: vi.fn() }));
vi.mock('@/app/document/[id]/EditorContext', () => ({
  useEditorContext: () => ({
    ...ctx,
    searchOpen: true,
    documentList: [],
    folders: [{ id: 'f 1', name: 'Plans' }],
    sharedDocuments: [],
    teams: [],
    teamFolders: [],
    teamDocuments: [],
    tabs: [],
    activeId: 't1',
    openDocument: vi.fn(),
    isReadOnly: true,
    setSearchOpen: vi.fn(),
    openSettingsAt: vi.fn(),
  }),
}));
vi.mock('@/hooks/canvas/useEditorCommands', () => ({
  useEditorCommands: () => ({ commandItems: [], runCommand: vi.fn() }),
}));
vi.mock('@/hooks/ui/useIconCatalogs', () => ({ useIconCatalogs: () => undefined }));
vi.mock('@/components/palette/useEditorTileActions', () => ({ useEditorTileActions: () => ({}) }));

import { takeDrawingReveal } from '@/lib/text-document/text-document-drawing-reveal';
import { EditorSearchPanel } from './EditorSearchPanel';

afterEach(() => vi.unstubAllGlobals());

// The editor's search panel (docs/specs/008-canvas/canvas-and-palette.md "Search panel").
describe('EditorSearchPanel', () => {
  it('opens a picked personal folder on the Explorer page', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { origin: 'https://example.test', assign });
    render(<EditorSearchPanel />);
    const onSelectFolder = panelProps.current?.onSelectFolder as ((id: string) => void) | undefined;
    expect(onSelectFolder).toBeTypeOf('function');
    onSelectFolder!('f 1');
    expect(assign).toHaveBeenCalledWith('https://example.test/explorer/folder?id=f%201');
  });

  type SelectElement = (tabId: string, elementId: string, drawingTabId?: string) => void;
  const selectElement = () => panelProps.current?.onSelectElement as SelectElement;

  it('opens an element on its tab, selected', () => {
    render(<EditorSearchPanel />);
    selectElement()('t2', 'e1');
    expect(ctx.setActiveId).toHaveBeenLastCalledWith('t2');
    expect(ctx.setSelectedId).toHaveBeenLastCalledWith('e1');
  });

  // docs/specs/034-text-documents/objects.md "The document around it": a drawing's element opens its text document
  // at the drawing's picture.
  it("opens a drawing's element at its picture in the text document", () => {
    render(<EditorSearchPanel />);
    selectElement()('w', 'e1', 'd1');
    expect(ctx.setActiveId).toHaveBeenLastCalledWith('w');
    expect(ctx.setSelectedId).toHaveBeenLastCalledWith(null);
    expect(takeDrawingReveal('w')).toBe('d1');
  });
});
