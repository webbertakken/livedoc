// The sizing guard (docs/specs/004-interface-design/sizing.md "The guard").
//
// A folder or file that has moved to the sizing scale draws every size from it: type, weight, capitals, heights,
// icons, gaps, side padding and radii. The guard reads every static string in its source (D234), splits it into
// classes and refuses each one off the scale, naming the token to use instead. A size set under a coarse pointer is
// touch's (docs/specs/004-interface-design/touch-targets.md) and passes. Each site runs it over its moved paths.

import { existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseSourceFiles } from '@livedoc/source-ast';
import {
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  isTemplateExpression,
  type Node,
} from 'typescript/unstable/ast';
import { isTypeScriptSource, listSourceFiles } from './source-files';
import {
  DISPLAY_TYPE_MIN_PX,
  GAP_STEPS,
  LAYOUT_GAP_STEPS,
  ROOT_PX,
  SIDE_PADDING_STEPS,
  SIZING_SCALE,
} from './sizing';

export type SizingViolation = { file: string; line: number; className: string; advice: string };

/** Where the guard reads: the app by default; a marketing site's pages also take display type and layout steps (D244). */
export type SizingOptions = { readonly marketingPages?: boolean };

// The smallest and largest box the scale names; outside them a box is layout (a hairline, an avatar, a panel).
const SCALE_FLOOR_PX = Math.min(...Object.values(SIZING_SCALE.icon));
const SCALE_CEILING_PX = Math.max(...Object.values(SIZING_SCALE.height));
const SPACING_UNIT_PX = 4;

const TYPE_TOKENS = Object.keys(SIZING_SCALE.type).map((step) => `text-${step}`);
// Tailwind's own type sizes in px, the ones moved source must name by token.
const TAILWIND_TYPE_PX: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128,
};
const TAILWIND_RADIUS_PX: Record<string, number> = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  '4xl': 32,
};
// `[inherit]` draws its parent's radius, which the parent names from the scale.
const RADIUS_PASSES = new Set([...Object.keys(SIZING_SCALE.radius), 'full', 'none', '[inherit]']);
const ON_SCALE_WEIGHTS = new Set(['normal', 'medium']);
const OFF_SCALE_WEIGHTS = new Set([
  'thin',
  'extralight',
  'light',
  'semibold',
  'bold',
  'extrabold',
  'black',
]);
const NO_TRACKED_CAPITALS = 'no tracked capitals: the label reads as its copy is written';

/** A `[...]` length in px, or null when the bracket holds anything else (a colour, a var, a calc, vh). */
function bracketPx(value: string): number | null {
  const inner = /^\[(?:length:)?(-?\d*\.?\d+)(px|rem)\]$/.exec(value);
  if (!inner) return null;
  const n = Number(inner[1]);
  return inner[2] === 'rem' ? n * ROOT_PX : n;
}

/** A Tailwind spacing value (`7`, `8.5`, `[26px]`) in px, or null when it is not a length. */
function spacingPx(value: string): number | null {
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * SPACING_UNIT_PX;
  return bracketPx(value);
}

function stepFor(px: number, steps: Record<string, number>): string | undefined {
  return Object.entries(steps).find(([, size]) => size === px)?.[0];
}

function judgeType(value: string, options: SizingOptions): string | null {
  const [size = '', line] = value.split('/');
  if (TYPE_TOKENS.includes(`text-${size}`)) {
    return line === undefined ? null : `a type token carries its own line: use text-${size}`;
  }
  const px = TAILWIND_TYPE_PX[size] ?? bracketPx(size);
  if (px === undefined || px === null) return null;
  if (options.marketingPages && px >= DISPLAY_TYPE_MIN_PX) return null;
  const step = Object.entries(SIZING_SCALE.type).find(([, [s]]) => s === px)?.[0];
  return step
    ? `use text-${step}`
    : `type size off the scale: use one of ${TYPE_TOKENS.join(', ')}`;
}

function judgeBox(prefix: string, value: string): string | null {
  const px = spacingPx(value);
  if (px === null || px < SCALE_FLOOR_PX || px > SCALE_CEILING_PX) return null;
  const step = stepFor(px, SIZING_SCALE.height) ?? stepFor(px, SIZING_SCALE.icon);
  if (step) return `use ${prefix}-${step}`;
  const steps = [...Object.keys(SIZING_SCALE.height), ...Object.keys(SIZING_SCALE.icon)];
  return `height off the scale: use ${prefix}- with one of ${steps.join(', ')}`;
}

function judgeSpacingStep(value: string, steps: readonly number[], what: string): string | null {
  const units = /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
  if (units !== null && steps.includes(units)) return null;
  return `${what} off the scale: use one of ${steps.join(', ')} (Tailwind units)`;
}

function judgeRadius(side: string | undefined, value: string | undefined): string | null {
  const prefix = side ? `rounded-${side}` : 'rounded';
  const offScale = `radius off the scale: use ${prefix}-control, -menu, -surface or -full`;
  if (value === undefined) return offScale;
  if (RADIUS_PASSES.has(value)) return null;
  const px = TAILWIND_RADIUS_PX[value] ?? bracketPx(value);
  // A word Tailwind does not know is not a radius; any bracket is one, and only a token names it.
  if (px === undefined || px === null) return value.startsWith('[') ? offScale : null;
  const step = stepFor(px, SIZING_SCALE.radius);
  return step ? `use ${prefix}-${step}` : offScale;
}

/** The variants and the utility of a class, split on `:` outside brackets and parentheses. */
function splitVariants(className: string): { variants: string[]; utility: string } {
  const variants: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < className.length; i += 1) {
    const char = className[i];
    if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth -= 1;
    else if (char === ':' && depth === 0) {
      variants.push(className.slice(start, i));
      start = i + 1;
    }
  }
  return { variants, utility: className.slice(start) };
}

// A field reads 16 px on a phone so iOS never zooms in on it (apps/live/app/globals.css); a control that sits among
// fields, a picker drawn as a button, takes the same floor.
const PHONE_FIELD_FLOOR = { variant: 'max-sm', utility: 'text-[16px]' } as const;
const isPhoneFieldFloor = (variants: readonly string[], utility: string): boolean =>
  variants.length === 1 &&
  variants[0] === PHONE_FIELD_FLOOR.variant &&
  utility === PHONE_FIELD_FLOOR.utility;

const isCoarsePointer = (variant: string): boolean =>
  variant === 'pointer-coarse' || variant.replace(/\s/g, '').includes('pointer:coarse');

const RADIUS_SIDE = /^rounded-(t|r|b|l|s|e|ss|se|ee|es|tl|tr|bl|br)(?:-(.+))?$/;

// Each sized family's prefixes, longest first so `min-h-` is never read as `h-`.
const FAMILIES: readonly (readonly [
  string,
  (prefix: string, value: string, options: SizingOptions) => string | null,
])[] = [
  ['text', (_, value, options) => judgeType(value, options)],
  ['font', (_, value) => judgeWeight(value)],
  ['tracking', (_, value) => judgeTracking(value)],
  ...(['min-h', 'size', 'h'] as const).map(
    (prefix) => [prefix, (p: string, value: string) => judgeBox(p, value)] as const,
  ),
  ...(['gap-x', 'gap-y', 'gap', 'space-x', 'space-y'] as const).map(
    (prefix) =>
      [
        prefix,
        (_: string, value: string, options: SizingOptions) =>
          judgeSpacingStep(
            value,
            options.marketingPages ? [...GAP_STEPS, ...LAYOUT_GAP_STEPS] : GAP_STEPS,
            'gap',
          ),
      ] as const,
  ),
  ...(['px', 'pl', 'pr', 'ps', 'pe', 'p'] as const).map(
    (prefix) =>
      [
        prefix,
        (_: string, value: string) => judgeSpacingStep(value, SIDE_PADDING_STEPS, 'side padding'),
      ] as const,
  ),
];

function judgeWeight(value: string): string | null {
  if (ON_SCALE_WEIGHTS.has(value)) return null;
  return OFF_SCALE_WEIGHTS.has(value) || /^\[\d+\]$/.test(value)
    ? 'weight off the scale: use font-normal, or font-medium for a pressed, selected or primary control'
    : null;
}

function judgeTracking(value: string): string | null {
  return /^(wide|wider|widest)$/.test(value) || /^\[\d*\.?\d+(em|px|rem)\]$/.test(value)
    ? NO_TRACKED_CAPITALS
    : null;
}

/**
 * Why a class is off the sizing scale, naming the token to use instead, or null when it is on the scale or is not a
 * size at all.
 */
export function judgeClass(className: string, options: SizingOptions = {}): string | null {
  const { variants, utility: raw } = splitVariants(className);
  if (variants.some(isCoarsePointer)) return null;
  const utility = raw.replace(/^!|!$/g, '');
  if (isPhoneFieldFloor(variants, utility)) return null;

  // text-optical-caps is uppercase with its tracking (theme.css), so it is tracked capitals too.
  if (utility === 'uppercase' || utility === 'text-optical-caps') return NO_TRACKED_CAPITALS;
  if (utility === 'rounded') return judgeRadius(undefined, undefined);
  const side = RADIUS_SIDE.exec(utility);
  if (side) return judgeRadius(side[1], side[2]);
  if (utility.startsWith('rounded-'))
    return judgeRadius(undefined, utility.slice('rounded-'.length));

  for (const [prefix, judge] of FAMILIES) {
    // A prefix with nothing after it is a word being built (`gap-${n}`), not a class.
    if (utility.startsWith(`${prefix}-`)) {
      const value = utility.slice(prefix.length + 1);
      return value === '' ? null : judge(prefix, value, options);
    }
  }
  return null;
}

/** Every static string under a node, with the node it came from. */
function staticStrings(root: Node, found: (text: string, at: Node) => void): void {
  const visit = (n: Node): void => {
    if (isStringLiteral(n) || isNoSubstitutionTemplateLiteral(n)) found(n.text, n);
    else if (isTemplateExpression(n)) {
      found(n.head.text, n.head);
      for (const span of n.templateSpans) {
        visit(span.expression);
        found(span.literal.text, span.literal);
      }
      return;
    }
    n.forEachChild(visit);
  };
  visit(root);
}

/**
 * Every off-scale class in the moved `paths` (folders or files, relative to `root`), but for the files or folders
 * `except` names inside them (drawn art, or a part that moves with a later slice).
 */
export function checkSizing({
  root,
  paths,
  except = [],
  marketingPages = false,
}: {
  root: string;
  paths: readonly string[];
  except?: readonly string[];
} & SizingOptions): SizingViolation[] {
  const existing = (path: string): string => {
    const full = join(root, path);
    if (!existsSync(full)) throw new Error(`sizing guard: no path ${path} under ${root}`);
    return full;
  };
  const excepted = except.map(existing);
  const isExcepted = (file: string): boolean =>
    excepted.some((path) => file === path || file.startsWith(path + sep));
  const files = paths
    .flatMap((path) => {
      const full = existing(path);
      if (statSync(full).isDirectory()) return listSourceFiles(full, isTypeScriptSource);
      return isTypeScriptSource(full) ? [full] : [];
    })
    .filter((file) => !isExcepted(file));
  const violations: SizingViolation[] = [];
  for (const sf of parseSourceFiles(files)) {
    staticStrings(sf, (text, at) => {
      for (const className of text.split(/\s+/)) {
        const advice = judgeClass(className, { marketingPages });
        if (advice === null) continue;
        violations.push({
          file: relative(root, sf.fileName).split(sep).join('/'),
          line: sf.getLineAndCharacterOfPosition(at.getStart(sf)).line + 1,
          className,
          advice,
        });
      }
    });
  }
  return violations;
}

export function formatSizingViolations(violations: readonly SizingViolation[]): string {
  return violations
    .map((v) => `${v.file}:${v.line}  ${v.className}  (sizing guard: ${v.advice})`)
    .join('\n');
}
