import { describe, expect, it } from 'vitest';
import { listModules, moduleTypeOf } from './bundle-modules';

// wrangler's module rules for this worker: apps/api/wrangler.toml's, then its defaults.
const RULES = [
  { type: 'Data', include: ['**/*.ttf', '**/*.otf'] },
  { type: 'Text', include: ['**/*.txt', '**/*.html', '**/*.sql'] },
  { type: 'Data', include: ['**/*.bin'] },
  { type: 'CompiledWasm', include: ['**/*.wasm', '**/*.wasm?module'] },
];

describe('moduleTypeOf', () => {
  it('types a script as an ES module', () => {
    expect(moduleTypeOf('chunk.js', RULES)).toBe('ESModule');
  });

  it('types a file by the first rule its extension meets', () => {
    expect(moduleTypeOf('abc-index_bg.wasm', RULES)).toBe('CompiledWasm');
    expect(moduleTypeOf('abc-Inter-Bold.otf', RULES)).toBe('Data');
    expect(moduleTypeOf('schema.sql', RULES)).toBe('Text');
  });

  it('types nothing no rule names', () => {
    expect(moduleTypeOf('index.js.map', RULES)).toBeNull();
    expect(moduleTypeOf('README.md', RULES)).toBeNull();
  });
});

describe('listModules', () => {
  it('lists the entry first, then every other module, leaving out what is not one', () => {
    const files = [
      'a-Inter-Regular.ttf',
      'README.md',
      'index.js',
      'b-index_bg.wasm',
      'index.js.map',
    ];
    expect(listModules(files, RULES)).toEqual([
      { type: 'ESModule', file: 'index.js' },
      { type: 'Data', file: 'a-Inter-Regular.ttf' },
      { type: 'CompiledWasm', file: 'b-index_bg.wasm' },
    ]);
  });
});
