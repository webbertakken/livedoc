// docs/specs/034-text-documents/page-layout.md "Breaks": a continuous section in ODF is a named region.
import { describe, expect, it } from 'vitest';
import { odfSectionRegion } from './odf-region';

describe('odfSectionRegion', () => {
  it('names a new region apart from the regions there are', () => {
    expect(odfSectionRegion([]).xml).toBe('<text:section text:name="LiveDocSection1">');
    const taken = [odfSectionRegion([]), { xml: '<text:section text:name="Other">', ns: {} }];
    expect(odfSectionRegion(taken).xml).toBe('<text:section text:name="LiveDocSection2">');
    expect(odfSectionRegion([]).ns).toEqual({
      text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    });
  });
});
