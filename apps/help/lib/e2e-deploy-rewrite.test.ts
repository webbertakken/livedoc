import { describe, expect, it } from 'vitest';
import { renameChunkReferences } from '../../../scripts/e2e-deploy-rewrite.mjs';

// docs/specs/003-system-architecture/e2e-smoke.md: the e2e stack's simulated deploy renames every chunk and
// rewrites every reference to it, so a page from the deploy never names a chunk the deploy removed.

const renames = new Map([
  ['0abc-def.js', '0abc-def-d1.js'],
  ['def.js', 'def-d1.js'],
]);

function push(text: string): string {
  return `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
}

describe('renameChunkReferences', () => {
  it('renames a chunk named in a script tag and in the page data', () => {
    const html = `<script src="/live/_next/static/chunks/0abc-def.js"></script>${push(
      '1:"/live/_next/static/chunks/0abc-def.js"\n',
    )}`;
    const out = renameChunkReferences(html, renames);
    expect(out).not.toMatch(/0abc-def\.js/);
    expect(out.match(/0abc-def-d1\.js/g)).toHaveLength(2);
  });

  it('renames a chunk whose name the page data splits across two pushes', () => {
    const html = push('1:"/live/_next/static/chunks/0abc-') + push('def.js"\n2:"x"\n');
    const out = renameChunkReferences(html, renames);
    const data = [...out.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
      .map((m) => JSON.parse(m[1]!) as string)
      .join('');
    expect(data).toBe('1:"/live/_next/static/chunks/0abc-def-d1.js"\n2:"x"\n');
  });

  it('keeps the page data safe inside its script tag', () => {
    const html = push('0abc-') + push('def.js</b>');
    const out = renameChunkReferences(html, renames);
    expect(out.match(/<\/script>/g)).toHaveLength(2);
    expect(out).toContain('\\u003c/b>');
  });

  it('leaves a longer name that only ends like a chunk alone', () => {
    expect(renameChunkReferences('"/chunks/xdef.js"', renames)).toBe('"/chunks/xdef.js"');
  });
});
