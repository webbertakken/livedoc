// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchNewDocumentContentAhead = vi.fn();
const loadEditorPage = vi.fn(() => Promise.resolve());

vi.mock('@/lib/new-document/new-document-content-loader', () => ({ fetchNewDocumentContentAhead }));
vi.mock('@/lib/editor-page-loader', () => ({ loadEditorPage }));

const { fetchAheadForNamedDocument } = await import('./named-document-ahead');

describe('fetching ahead for a named document', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/new');
  });

  it.each(['?template=kanban', '?blank=1'])(
    'fetches what makes it and the editor at once for %s',
    (search) => {
      window.history.replaceState(null, '', `/new${search}`);

      expect(fetchAheadForNamedDocument()).toBe(true);

      expect(fetchNewDocumentContentAhead).toHaveBeenCalledTimes(1);
      expect(loadEditorPage).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['', '?mode=plan', '?template=no-such-template'])(
    'leaves the wizard to fetch on idle for "%s"',
    (search) => {
      window.history.replaceState(null, '', `/new${search}`);

      expect(fetchAheadForNamedDocument()).toBe(false);

      expect(fetchNewDocumentContentAhead).not.toHaveBeenCalled();
      expect(loadEditorPage).not.toHaveBeenCalled();
    },
  );

  it('keeps a failed editor fetch to the handoff, which asks again', async () => {
    window.history.replaceState(null, '', '/new?blank=1');
    loadEditorPage.mockReturnValueOnce(Promise.reject(new Error('chunk failed')));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    fetchAheadForNamedDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
