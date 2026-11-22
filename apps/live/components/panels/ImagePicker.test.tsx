// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The image picker in a workbench (docs/specs/013-workspace/workbench-embeds.md, Surface
// table): upload only, and the person's gallery is never read.

const { apiListImages } = vi.hoisted(() => ({ apiListImages: vi.fn(async () => []) }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  apiListImages,
}));

const { ImagePicker } = await import('./ImagePicker');

function show(uploadOnly?: boolean, initialTab?: 'upload' | 'gallery' | 'search') {
  render(
    <ImagePicker
      ownerId="user_1"
      documentId="doc-1"
      forElementId={null}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      uploadOnly={uploadOnly}
      initialTab={initialTab}
    />,
  );
}

afterEach(() => apiListImages.mockClear());

describe('ImagePicker', () => {
  it('offers the gallery and search, and reads the gallery', () => {
    show();
    expect(screen.getByRole('button', { name: /Gallery/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(apiListImages).toHaveBeenCalledWith('user_1');
  });

  it('shows an empty gallery as the shared empty state', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Gallery/ }));
    expect((await screen.findByText('No images yet')).closest('[data-empty-state]')).toBeTruthy();
  });

  it('offers upload only in a workbench, and never reads the gallery', () => {
    show(true);
    expect(screen.queryByRole('button', { name: /Gallery/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    expect(screen.getByText('Drop, paste, or click to choose an image')).toBeTruthy();
    expect(apiListImages).not.toHaveBeenCalled();
  });
});

// docs/specs/034-text-documents/objects.md "Inserting": Insert > Image > LiveDoc gallery opens the picker on its gallery.
describe('ImagePicker opened on a tab', () => {
  it('shows the gallery first when asked', async () => {
    show(false, 'gallery');
    expect(await screen.findByText('No images yet')).toBeTruthy();
    expect(screen.queryByText('Drop, paste, or click to choose an image')).toBeNull();
  });

  it('keeps a workbench on upload whatever tab is asked', () => {
    show(true, 'gallery');
    expect(screen.getByText('Drop, paste, or click to choose an image')).toBeTruthy();
  });
});
