// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { measuringRange } from './pagination-range';

// docs/specs/034-text-documents/performance.md "A keystroke's frame": one range per document, reused.
describe('measuringRange', () => {
  it('gives the same range for a document, every time, and another for another document', () => {
    const create = vi.spyOn(document, 'createRange');
    const first = measuringRange(document);
    expect(measuringRange(document)).toBe(first);
    expect(create).toHaveBeenCalledOnce();
    const other = document.implementation.createHTMLDocument('other');
    expect(measuringRange(other)).not.toBe(first);
    create.mockRestore();
  });
});
