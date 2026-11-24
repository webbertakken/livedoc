// @vitest-environment jsdom

// The top line (docs/specs/004-interface-design/sizing.md "The editor's toolbars"): the line the drawing tools sit
// on, whose controls take the tools' 32px so it reads as one height (D242).

import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TopLine } from './TopLine';

afterEach(cleanup);

describe('TopLine', () => {
  it('marks itself the tool line, so the groups on it draw their controls at the tools’ step', () => {
    render(<TopLine brand={<span>Brand</span>} actions={<span>Actions</span>} />);
    const line = screen.getByText('Brand').parentElement!;
    expect(line.hasAttribute('data-tool-line')).toBe(true);
    expect(line.hasAttribute('data-top-line')).toBe(true);
  });

  it('is what the tool-line variant matches, inside it', () => {
    const css = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8');
    expect(css).toContain('@custom-variant tool-line (&:where([data-tool-line] *));');
  });
});
