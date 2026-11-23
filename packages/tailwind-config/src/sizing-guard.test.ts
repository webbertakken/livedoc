import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations, judgeClass } from './sizing-guard';

// docs/specs/004-interface-design/sizing.md "The guard": a moved folder holds every size to the scale.
describe('judgeClass', () => {
  it('names the type token for a raw type size', () => {
    expect(judgeClass('text-sm')).toMatch(/text-body/);
    expect(judgeClass('text-xs')).toMatch(/text-supporting/);
    expect(judgeClass('text-base/5')).toMatch(/text-panel-title/);
    expect(judgeClass('text-[14px]')).toMatch(/text-body/);
    expect(judgeClass('text-[0.875rem]')).toMatch(/text-body/);
  });

  it('lists the type steps for an off-scale type size', () => {
    expect(judgeClass('text-[13px]')).toMatch(/off the scale.*text-glyph.*text-page-title/);
    expect(judgeClass('text-[length:11px]')).toMatch(/off the scale/);
    expect(judgeClass('text-3xl')).toMatch(/off the scale/);
  });

  it('refuses a line-height modifier on a type token', () => {
    expect(judgeClass('text-body/6')).toMatch(/line/);
  });

  it('passes type tokens and every text utility that is not a size', () => {
    for (const ok of [
      'text-body',
      'text-glyph',
      'text-page-title',
      'text-slate-500',
      'text-white',
      'text-center',
      'text-optical-line',
      'text-[#fff]',
      'text-[var(--office-ink)]',
      'text-(--office-ink)',
    ]) {
      expect(judgeClass(ok), ok).toBeNull();
    }
  });

  it('refuses a weight other than regular and medium', () => {
    for (const weight of ['font-semibold', 'font-bold', 'font-light', 'font-black', 'font-[650]']) {
      expect(judgeClass(weight), weight).toMatch(/font-normal.*font-medium/);
    }
    expect(judgeClass('font-medium')).toBeNull();
    expect(judgeClass('font-normal')).toBeNull();
    expect(judgeClass('font-mono')).toBeNull();
  });

  it('refuses tracked capitals', () => {
    expect(judgeClass('uppercase')).toMatch(/no tracked capitals/);
    expect(judgeClass('tracking-wide')).toMatch(/no tracked capitals/);
    expect(judgeClass('tracking-[0.08em]')).toMatch(/no tracked capitals/);
    expect(judgeClass('tracking-tight')).toBeNull();
    expect(judgeClass('normal-case')).toBeNull();
  });

  it('names the height or icon token for a numeric size on the scale', () => {
    expect(judgeClass('h-7')).toMatch(/h-row/);
    expect(judgeClass('size-8')).toMatch(/size-field/);
    expect(judgeClass('min-h-9')).toMatch(/min-h-prominent/);
    expect(judgeClass('h-6')).toMatch(/h-chip/);
    expect(judgeClass('size-4')).toMatch(/size-icon-row/);
    expect(judgeClass('size-3')).toMatch(/size-icon-chevron/);
    expect(judgeClass('size-[18px]')).toMatch(/size-icon-toolbar/);
    expect(judgeClass('h-5')).toMatch(/h-icon-title/);
  });

  it('refuses a height between 12 and 36 px that is off the scale', () => {
    expect(judgeClass('h-[26px]')).toMatch(/off the scale/);
    expect(judgeClass('h-8.5')).toMatch(/off the scale/);
    expect(judgeClass('size-3.5')).toMatch(/off the scale/);
    expect(judgeClass('min-h-[2.1rem]')).toMatch(/off the scale/);
  });

  it('passes a box under 12 or over 36 px, and lengths that are not px or rem', () => {
    for (const ok of [
      'h-px',
      'h-2',
      'size-2.5',
      'h-10',
      'h-11',
      'size-16',
      'h-full',
      'h-[50vh]',
      'min-h-0',
      'h-[calc(100%-2rem)]',
      'h-row',
      'size-icon-row',
      'w-7',
    ]) {
      expect(judgeClass(ok), ok).toBeNull();
    }
  });

  it('refuses a gap off the steps', () => {
    expect(judgeClass('gap-1.5')).toMatch(/gap/);
    expect(judgeClass('gap-x-5')).toMatch(/gap/);
    expect(judgeClass('space-y-2.5')).toMatch(/gap/);
    expect(judgeClass('gap-[3px]')).toMatch(/gap/);
    expect(judgeClass('gap-px')).toMatch(/gap/);
    for (const ok of ['gap-0', 'gap-0.5', 'gap-1', 'gap-2', 'gap-y-3', 'gap-4', 'space-x-6']) {
      expect(judgeClass(ok), ok).toBeNull();
    }
  });

  it('refuses a side padding off the steps', () => {
    expect(judgeClass('px-2.5')).toMatch(/padding/);
    expect(judgeClass('p-1.5')).toMatch(/padding/);
    expect(judgeClass('pl-5')).toMatch(/padding/);
    expect(judgeClass('pe-[10px]')).toMatch(/padding/);
    expect(judgeClass('px-row')).toMatch(/padding/);
    for (const ok of [
      'px-0',
      'p-0.5',
      'px-1',
      'px-2',
      'pr-3',
      'ps-4',
      'p-6',
      'py-1.5',
      'pt-5',
      'pb-[3px]',
    ]) {
      expect(judgeClass(ok), ok).toBeNull();
    }
  });

  it('names a radius by its token', () => {
    expect(judgeClass('rounded-md')).toMatch(/rounded-control/);
    expect(judgeClass('rounded-lg')).toMatch(/rounded-menu/);
    expect(judgeClass('rounded-xl')).toMatch(/rounded-surface/);
    expect(judgeClass('rounded-t-xl')).toMatch(/rounded-t-surface/);
    expect(judgeClass('rounded')).toMatch(/off the scale/);
    expect(judgeClass('rounded-2xl')).toMatch(/off the scale/);
    expect(judgeClass('rounded-tl-[5px]')).toMatch(/off the scale/);
    expect(judgeClass('rounded-[var(--radius)]')).toMatch(/off the scale/);
    expect(judgeClass('rounded-[8px]')).toMatch(/rounded-menu/);
    expect(judgeClass('rounded-t')).toMatch(/off the scale/);
    for (const ok of [
      'rounded-control',
      'rounded-menu',
      'rounded-b-surface',
      'rounded-full',
      'rounded-none',
      'rounded-[inherit]',
      'rounded-t-[inherit]',
    ]) {
      expect(judgeClass(ok), ok).toBeNull();
    }
  });

  it('judges the utility under its variants, important and all', () => {
    expect(judgeClass('hover:text-sm')).toMatch(/text-body/);
    expect(judgeClass('md:dark:h-7')).toMatch(/h-row/);
    expect(judgeClass('!rounded-md')).toMatch(/rounded-control/);
    expect(judgeClass('rounded-md!')).toMatch(/rounded-control/);
    expect(judgeClass('[&>svg]:size-4')).toMatch(/size-icon-row/);
  });

  it("passes touch's own sizes, set under a coarse pointer", () => {
    expect(judgeClass('pointer-coarse:h-11')).toBeNull();
    expect(judgeClass('pointer-coarse:text-base')).toBeNull();
    expect(judgeClass('[@media(pointer:coarse)]:px-5')).toBeNull();
    expect(judgeClass('md:pointer-coarse:h-9')).toBeNull();
  });

  it('passes words that are not utilities', () => {
    for (const ok of [
      'Rename',
      'https://docs.nu',
      'h-row-ish',
      '',
      'text',
      'rounded-corners',
      'gap-',
      'h-',
      'text-',
    ]) {
      expect(judgeClass(ok), ok).toBeNull();
    }
  });
});

describe('checkSizing', () => {
  let root: string;
  const write = (path: string, source: string): void => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), source);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sizing-guard-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports every off-scale class in a moved folder, in markup and in constants', () => {
    write(
      'moved/Row.tsx',
      [
        "const SIZES = { sm: 'h-7 px-3 text-sm' };",
        'export const Row = () => (',
        '  <div className={`flex ${SIZES.sm} gap-2 rounded-md`}>Row</div>',
        ');',
      ].join('\n'),
    );

    const violations = checkSizing({ root, paths: ['moved'] });

    expect(violations).toEqual([
      expect.objectContaining({ file: 'moved/Row.tsx', line: 1, className: 'h-7' }),
      expect.objectContaining({ file: 'moved/Row.tsx', line: 1, className: 'text-sm' }),
      expect.objectContaining({ file: 'moved/Row.tsx', line: 3, className: 'rounded-md' }),
    ]);
  });

  it('leaves folders that have not moved, tests and declarations alone', () => {
    write('moved/Row.test.tsx', "const a = 'text-sm';");
    write('moved/types.d.ts', "declare const a: 'text-sm';");
    write('later/Row.tsx', "export const a = 'text-sm';");

    expect(checkSizing({ root, paths: ['moved'] })).toEqual([]);
  });

  it('checks a moved file on its own, leaving its folder alone', () => {
    write('ui/Button.tsx', "export const a = 'text-sm';");
    write('ui/Footer.tsx', "export const a = 'text-sm';");
    write('ui/Button.test.tsx', "export const a = 'text-sm';");

    const violations = checkSizing({ root, paths: ['ui/Button.tsx', 'ui/Button.test.tsx'] });

    expect(violations.map((v) => v.file)).toEqual(['ui/Button.tsx']);
  });

  it('checks nothing for an empty list', () => {
    write('later/Row.tsx', "export const a = 'text-sm';");

    expect(checkSizing({ root, paths: [] })).toEqual([]);
  });

  it('throws on a path that does not exist, so a typo never passes', () => {
    expect(() => checkSizing({ root, paths: ['moevd'] })).toThrow(/sizing guard: no path moevd/);
  });

  it('formats one line per refusal with its advice, and nothing when clean', () => {
    write('moved/Row.tsx', "export const a = 'h-7';");

    const text = formatSizingViolations(checkSizing({ root, paths: ['moved'] }));

    expect(text).toMatch(/^moved\/Row\.tsx:1 {2}h-7 {2}\(sizing guard: .*h-row.*\)$/);
    expect(formatSizingViolations([])).toBe('');
  });
});
