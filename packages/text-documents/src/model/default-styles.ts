// A person's default styles (docs/specs/034-text-documents/text-and-paragraphs.md "Default styles"): per style role,
// what its look holds that Google's defaults do not, so an unchanged set keeps nothing. Saved from one document, used
// in another, and read back from preferences that may have come from anywhere, so every value is checked on read.
import { canonical } from './props';
import { LOOK_PARAGRAPH_KEYS, LOOK_TEXT_KEYS, StyleLooks, type StyleLook } from './style-looks';
import { STYLE_ROLES, Styles, type Style, type StyleDefaults, type StyleRole } from './styles';

export type DefaultStyleLook = {
  readonly text?: Partial<StyleLook['text']>;
  readonly paragraph?: Partial<StyleLook['paragraph']>;
};

export type DefaultStyles = Partial<Record<StyleRole, DefaultStyleLook>>;

/** The most a saved set takes when every property of all nine looks is changed (user-preferences.md "It fits"). */
export const DEFAULT_STYLES_MAX_CHARS = 5000;

const FONT_NAME = /^[\p{L}\p{N} ._'-]{1,100}$/u;
const HEX = /^#[0-9a-f]{6}$/i;
const LENGTH_MAX = 1584;

const isBoolean = (v: unknown) => typeof v === 'boolean';
const isNumberIn = (min: number, max: number) => (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isOneOf =
  (...values: readonly string[]) =>
  (v: unknown) =>
    typeof v === 'string' && values.includes(v);
const isLength = isNumberIn(-LENGTH_MAX, LENGTH_MAX);

function isLineHeight(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const h = v as Record<string, unknown>;
  if (h.rule === 'multiple') return isNumberIn(0.06, 100)(h.value);
  return (h.rule === 'exact' || h.rule === 'atLeast') && isNumberIn(0, LENGTH_MAX)(h.pt);
}

const TEXT_CHECKS: Record<(typeof LOOK_TEXT_KEYS)[number], (v: unknown) => boolean> = {
  font: (v) => typeof v === 'string' && FONT_NAME.test(v),
  size: isNumberIn(1, 400),
  bold: isBoolean,
  italic: isBoolean,
  underline: isBoolean,
  strike: isBoolean,
  smallCaps: isBoolean,
  transform: isOneOf('uppercase', 'lowercase', 'capitalize', 'none'),
  color: (v) => typeof v === 'string' && HEX.test(v),
};

const PARAGRAPH_CHECKS: Record<(typeof LOOK_PARAGRAPH_KEYS)[number], (v: unknown) => boolean> = {
  align: isOneOf('start', 'center', 'end', 'justify'),
  indentStart: isLength,
  indentEnd: isLength,
  indentFirst: isLength,
  spaceBefore: isNumberIn(0, LENGTH_MAX),
  spaceAfter: isNumberIn(0, LENGTH_MAX),
  lineHeight: isLineHeight,
  keepWithNext: isBoolean,
  keepTogether: isBoolean,
  widowControl: isBoolean,
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The known keys of one part of a look, each checked; null when any is wrong. */
function readPart(
  value: unknown,
  checks: Record<string, (v: unknown) => boolean>,
): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, check] of Object.entries(checks)) {
    if (value[key] === undefined) continue;
    if (!check(value[key])) return null;
    out[key] = value[key];
  }
  return out;
}

function differing<T extends Record<string, unknown>>(
  look: T,
  base: T,
  keys: readonly string[],
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (canonical(look[key]) !== canonical(base[key])) out[key] = look[key];
  return out as Partial<T>;
}

const builtInLooks = (): Record<StyleRole, StyleLook> => {
  const styles = Styles.builtIn('odf');
  const defaults = Styles.defaults();
  return Object.fromEntries(
    STYLE_ROLES.map((role) => [
      role,
      StyleLooks.of(styles, defaults, Styles.idOfRole(styles, role)),
    ]),
  ) as Record<StyleRole, StyleLook>;
};

export const DefaultStyles = {
  /** The roles' looks in this document, as what differs from Google's defaults; a role it lacks keeps nothing. */
  of: (styles: readonly Style[], defaults: StyleDefaults): DefaultStyles => {
    const google = builtInLooks();
    const out: Partial<Record<StyleRole, DefaultStyleLook>> = {};
    for (const role of STYLE_ROLES) {
      const id = Styles.idOfRole(styles, role);
      if (!id) continue;
      const look = StyleLooks.of(styles, defaults, id);
      const text = differing(look.text, google[role].text, LOOK_TEXT_KEYS);
      const paragraph = differing(look.paragraph, google[role].paragraph, LOOK_PARAGRAPH_KEYS);
      const kept: DefaultStyleLook = {
        ...(Object.keys(text).length > 0 ? { text } : {}),
        ...(Object.keys(paragraph).length > 0 ? { paragraph } : {}),
      };
      if (kept.text || kept.paragraph) out[role] = kept;
    }
    return out;
  },
  /** Every role's look: the saved values over Google's defaults (none saved is Reset styles). */
  looks: (saved: DefaultStyles): Record<StyleRole, StyleLook> => {
    const google = builtInLooks();
    return Object.fromEntries(
      STYLE_ROLES.map((role) => [
        role,
        {
          text: { ...google[role].text, ...saved[role]?.text },
          paragraph: { ...google[role].paragraph, ...saved[role]?.paragraph },
        },
      ]),
    ) as Record<StyleRole, StyleLook>;
  },
  /** A saved set read back: unknown keys dropped, any wrong value refuses the whole set (null). */
  parse: (value: unknown): DefaultStyles | null => {
    if (!isRecord(value)) return null;
    const out: Partial<Record<StyleRole, DefaultStyleLook>> = {};
    for (const role of STYLE_ROLES) {
      const entry = value[role];
      if (entry === undefined) continue;
      if (!isRecord(entry)) return null;
      const text = readPart(entry.text, TEXT_CHECKS);
      const paragraph = readPart(entry.paragraph, PARAGRAPH_CHECKS);
      if (text === null || paragraph === null) return null;
      out[role] = {
        ...(text ? { text } : {}),
        ...(paragraph ? { paragraph } : {}),
      };
    }
    return out;
  },
} as const;
