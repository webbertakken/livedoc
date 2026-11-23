// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Layers": the file's layers by name, each a toggle pressed while it
// shows for this person; a press shows or hides it, a locked one takes none; what is said of none, too many, a list
// that cannot be read and layers the engine cannot draw so.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfLayer } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { LAYERS_COPY, PdfLayersPanel } from './PdfLayersPanel';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const LAYERS: PdfLayer[] = [
  { id: 'o:4', name: 'Plan', visible: true, locked: false },
  { id: 'o:5', name: 'Notes', visible: false, locked: false },
  { id: 'o:6', name: 'Border', visible: true, locked: true },
];

async function show(
  layers: Promise<readonly PdfLayer[]>,
  hidden: readonly string[] | null = null,
  onSet = vi.fn(async () => true),
  most = 1_000,
) {
  const view = render(
    <PdfLayersPanel engine={{ layers: () => layers }} hidden={hidden} onSet={onSet} most={most} />,
  );
  await act(async () => {
    await layers.catch(() => {});
  });
  return { ...view, onSet };
}

const toggle = (name: RegExp | string) => screen.getByRole('button', { name });

describe('the layers panel', () => {
  it('says it is reading until the layers arrive', () => {
    render(
      <PdfLayersPanel
        engine={{ layers: () => new Promise(() => {}) }}
        hidden={null}
        onSet={vi.fn()}
        most={1_000}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(LAYERS_COPY.reading);
  });

  it('lists each layer as the file sets it, pressed while it shows, a locked one saying so', async () => {
    await show(Promise.resolve(LAYERS));
    expect(screen.getByRole('list', { name: 'Layers' })).toBeTruthy();
    expect(toggle('Plan').getAttribute('aria-pressed')).toBe('true');
    expect(toggle('Notes').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('Border, Locked').getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the layers as this person set them once they have', async () => {
    await show(Promise.resolve(LAYERS), ['o:4']);
    expect(toggle('Plan').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('Notes').getAttribute('aria-pressed')).toBe('true');
  });

  it('hides a shown layer and shows a hidden one, from the layers hidden now', async () => {
    const { onSet } = await show(Promise.resolve(LAYERS));
    await act(async () => {
      fireEvent.click(toggle('Plan'));
    });
    expect(onSet).toHaveBeenCalledWith('o:4', false, ['o:5']);
    await act(async () => {
      fireEvent.click(toggle('Notes'));
    });
    expect(onSet).toHaveBeenCalledWith('o:5', true, ['o:5']);
  });

  it('takes no press on a locked layer', async () => {
    const { onSet } = await show(Promise.resolve(LAYERS));
    fireEvent.click(toggle('Border, Locked'));
    expect(onSet).not.toHaveBeenCalled();
  });

  it('says when the layers cannot be shown or hidden here', async () => {
    await show(
      Promise.resolve(LAYERS),
      null,
      vi.fn(async () => false),
    );
    await act(async () => {
      fireEvent.click(toggle('Plan'));
    });
    expect(screen.getByRole('status').textContent).toBe(LAYERS_COPY.cannot);
  });

  it('says a PDF has none', async () => {
    await show(Promise.resolve([]));
    expect(screen.getByText(LAYERS_COPY.none)).toBeTruthy();
  });

  it('says when the PDF may hold more than are listed', async () => {
    await show(Promise.resolve(LAYERS), null, undefined, 3);
    expect(screen.getByText(LAYERS_COPY.cut)).toBeTruthy();
  });

  it('says and logs a list that cannot be read', async () => {
    await show(Promise.reject(new Error('stopped')));
    expect(screen.getByRole('alert').textContent).toBe(LAYERS_COPY.failed);
    expect(debugLog).toHaveBeenCalledWith('[pdf] layers-failed', 'Error: stopped');
  });
});
