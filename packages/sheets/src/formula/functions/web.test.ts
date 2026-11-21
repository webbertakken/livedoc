import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';
import { isUrl } from '../../text-checks';

// The Web functions' edges the oracle corpus (oracle/cases/Web.json) leaves out (formulas.md "Functions": Web).
describe('the web functions', () => {
  it('passes an error in the text on', () => {
    expect((calc('=ENCODEURL(1/0)') as { e?: string }).e).toBe('#DIV/0!');
  });

  it("reads Google's link schemes and refuses others", () => {
    expect(isUrl('telnet://host.test')).toBe(true);
    expect(isUrl('aim:goim?screenname=x')).toBe(true);
    expect(isUrl('javascript:alert(1)')).toBe(false);
  });

  it('shows a number label as a number', () => {
    expect(calc('=HYPERLINK("https://docs.nu", 5)')).toBe(5);
  });
});
