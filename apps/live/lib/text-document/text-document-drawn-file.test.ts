// docs/specs/034-text-documents/objects.md "In the file": a download draws each drawing it can reach afresh; one it
// cannot draw leaves with the picture last saved, said in the log.
import { describe, expect, it, vi } from 'vitest';

const { debugLog } = vi.hoisted(() => ({ debugLog: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog }));

const { drawingsForFile } = await import('./text-document-drawn-file');

describe('drawingsForFile', () => {
  it('draws each drawing, one at a time, keeping those drawn', async () => {
    const order: string[] = [];
    const drawn = await drawingsForFile(['d1', 'd2', 'd3'], async (id) => {
      order.push(id);
      if (id === 'd2') return null;
      if (id === 'd3') throw new Error('export failed');
      return new Uint8Array([id.length]);
    });
    expect(order).toEqual(['d1', 'd2', 'd3']);
    expect([...drawn.keys()]).toEqual(['d1']);
    expect(debugLog).toHaveBeenCalledWith('[text-document] drawing left as saved', {
      drawing: 'd2',
    });
    expect(debugLog).toHaveBeenCalledWith('[text-document] drawing not drawn for the file', {
      drawing: 'd3',
      error: 'Error: export failed',
    });
  });
});
