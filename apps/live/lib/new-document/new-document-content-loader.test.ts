import { afterEach, describe, expect, it, vi } from 'vitest';

const newDocumentContent = vi.fn();

describe('the new document content loader', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/new-document-content');
    vi.resetModules();
  });

  it('loads what makes a document', async () => {
    vi.doMock('@/lib/new-document-content', () => ({ newDocumentContent }));
    const { loadNewDocumentContent } = await import('./new-document-content-loader');

    const loaded = await loadNewDocumentContent();

    expect(loaded.newDocumentContent).toBe(newDocumentContent);
  });

  it('fetches ahead without letting a failed fetch escape', async () => {
    vi.doMock('@/lib/new-document-content', () => {
      throw new Error('chunk failed');
    });
    const { fetchNewDocumentContentAhead, loadNewDocumentContent } =
      await import('./new-document-content-loader');
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    fetchNewDocumentContentAhead();
    await expect(loadNewDocumentContent()).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
