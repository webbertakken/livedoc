// data-tools.md "Tables": Convert to Table and Insert › Table run the conversion, then open Table Settings; an
// Editor's alone.
import { describe, expect, it, vi } from 'vitest';
import { withTablePanel } from './spreadsheet-panels';

describe('withTablePanel', () => {
  it('converts, then opens Table Settings only when a table was made', () => {
    const reveal = vi.fn();
    let made = true;
    const bound = withTablePanel({}, { convert: () => made, reveal, canShape: true });
    bound['convert-to-table']!.run();
    expect(reveal).toHaveBeenCalledOnce();
    made = false;
    bound['insert-table']!.run();
    expect(reveal).toHaveBeenCalledOnce();
  });

  it('binds nothing for anyone but an Editor', () => {
    const before = {};
    expect(withTablePanel(before, { convert: () => true, reveal: vi.fn(), canShape: false })).toBe(
      before,
    );
  });
});
