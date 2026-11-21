// RE2 patterns, as Google Sheets' REGEX functions read them, written as JavaScript regular expressions of the same
// meaning (formulas.md "Text": the RE2 bullets). A recursive descent over RE2's grammar with its flags in force: it
// refuses what RE2 refuses, reads what only RE2 reads (inline flags, \Q..\E, ASCII classes, \x{..}, octal), and
// writes RE2's meanings out explicitly (ASCII \s, `.` short of \n alone, lines broken at \n alone, Unicode folding),
// so the JavaScript runs with the `u` flag and no other. Pure.

import { foldSet } from './case-fold';
import {
  type CodeSet,
  charSet,
  complementSet,
  codeSet,
  MAX_CODE_POINT,
  PERL_CLASSES,
  POSIX_CLASSES,
  setSource,
  unionSets,
} from './code-sets';

/** A pattern RE2 accepts: its JavaScript source (for the `u` flag) and how many capture groups it has. */
export type Re2Pattern = { readonly source: string; readonly groups: number };

/** A pattern RE2 refuses, and why (for logs and tests; the cell shows Google's own words). */
export type Re2Refusal = { readonly why: string };

// RE2 refuses a count past this, and nested counts whose product passes it (its RepetitionWalker).
export const RE2_COUNT_MAX = 1000;

type Flags = { i: boolean; m: boolean; s: boolean; U: boolean };

// Written source; whether a quantifier may follow it as it stands (one character, a class, a group); and the
// largest product of counts along any path inside it.
type Atom = { readonly source: string; readonly bare: boolean; readonly counts: number };

type Quantifier = { readonly source: string; readonly lazy: boolean; readonly count: number };

class Refused extends Error {}

const refuse = (why: string): never => {
  throw new Refused(why);
};

// Characters JavaScript reads as syntax outside a class (with `u`, only these may be escaped).
const SYNTAX = new Set('\\^$.|?*+()[]{}/');

const CONTROL_ESCAPES: Readonly<Record<string, number>> = {
  a: 7,
  f: 12,
  t: 9,
  n: 10,
  r: 13,
  v: 11,
};

const isOctal = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '7';
const isAsciiAlnum = (ch: string): boolean => /^[A-Za-z0-9]$/.test(ch);
const NEWLINE = charSet(10);
const EVERYTHING: CodeSet = [0, MAX_CODE_POINT];

class Translator {
  private at = 0;
  private groups = 0;
  private readonly names = new Set<string>();

  private readonly p: string;

  constructor(pattern: string) {
    this.p = pattern;
  }

  run(): Re2Pattern {
    const body = this.alternation({ i: false, m: false, s: false, U: false });
    if (this.at < this.p.length) refuse('unexpected )');
    return { source: body.source, groups: this.groups };
  }

  // Branches split by `|`, up to a `)` or the end. A flag group (`(?i)`) holds to the end of the enclosing group,
  // across later branches, so the branches share one set of flags, copied from the group's opening.
  private alternation(outer: Flags): Atom {
    const flags = { ...outer };
    const branches: string[] = [];
    let counts = 1;
    for (;;) {
      const branch = this.sequence(flags);
      branches.push(branch.source);
      counts = Math.max(counts, branch.counts);
      if (this.p[this.at] !== '|') break;
      this.at++;
    }
    return { source: branches.join('|'), bare: false, counts };
  }

  private sequence(flags: Flags): Atom {
    let out = '';
    let last: Atom | null = null;
    let lastStart = 0;
    let repeated = false;
    let counts = 1;
    while (this.at < this.p.length && this.p[this.at] !== '|' && this.p[this.at] !== ')') {
      const q = this.quantifier();
      if (q) {
        if (!last) return refuse('missing argument to repetition operator');
        if (repeated) refuse('bad repetition operator');
        const product: number = q.count > 0 ? last.counts * q.count : last.counts;
        if (product > RE2_COUNT_MAX) refuse('bad repetition operator');
        const body: string = last.bare ? last.source : `(?:${last.source})`;
        const source: string = `${body}${q.source}${q.lazy !== flags.U ? '?' : ''}`;
        out = out.slice(0, lastStart) + source;
        last = { source, bare: false, counts: product };
        counts = Math.max(counts, product);
        repeated = true;
        continue;
      }
      for (const atom of this.atoms(flags)) {
        lastStart = out.length;
        out += atom.source;
        last = atom;
        counts = Math.max(counts, atom.counts);
        repeated = false;
      }
    }
    return { source: out, bare: false, counts };
  }

  // A repetition operator here, if one: `*`, `+`, `?` or a well-formed count, each perhaps followed by `?`. A `{`
  // that starts no count is not one (it is a literal `{`).
  private quantifier(): Quantifier | null {
    const ch = this.p[this.at];
    let source: string;
    let count = 0;
    if (ch === '*' || ch === '+' || ch === '?') source = ch;
    else if (ch === '{') {
      const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(this.p.slice(this.at));
      if (!m) return null;
      const least = Number(m[1]);
      const most = m[2] === undefined ? least : m[3] === '' ? -1 : Number(m[3]);
      if (least > RE2_COUNT_MAX || most > RE2_COUNT_MAX || (most !== -1 && most < least))
        refuse('bad repetition operator');
      source = m[0];
      count = most === -1 ? least : most;
    } else return null;
    this.at += source.length;
    const lazy = this.p[this.at] === '?';
    if (lazy) this.at++;
    return { source, lazy, count };
  }

  // The atoms at this point: none for a flag group or an empty \Q\E, several for a quoted run, else one.
  private atoms(flags: Flags): Atom[] {
    const ch = this.p[this.at]!;
    if (ch === '(') return this.group(flags);
    if (ch === '[') return [this.charClass(flags)];
    if (ch === '.') {
      this.at++;
      return [setAtom(flags.s ? EVERYTHING : complementSet(NEWLINE))];
    }
    if (ch === '^') {
      this.at++;
      return [assertion(flags.m ? '(?:^|(?<=\\n))' : '^')];
    }
    if (ch === '$') {
      this.at++;
      return [assertion(flags.m ? '(?:$|(?=\\n))' : '$')];
    }
    if (ch === '\\') return this.escapeAtoms(flags);
    return [literal(this.codePoint(), flags)];
  }

  private codePoint(): number {
    const cp = this.p.codePointAt(this.at)!;
    this.at += cp > 0xffff ? 2 : 1;
    return cp;
  }

  private escapeAtoms(flags: Flags): Atom[] {
    const ch = this.p[this.at + 1];
    if (ch === 'Q') {
      const end = this.p.indexOf('\\E', this.at + 2);
      const quoted = this.p.slice(this.at + 2, end === -1 ? undefined : end);
      this.at = end === -1 ? this.p.length : end + 2;
      return [...quoted].map((c) => literal(c.codePointAt(0)!, flags));
    }
    const anchors: Readonly<Record<string, string>> = { A: '^', z: '$', b: '\\b', B: '\\B' };
    if (ch !== undefined && ch in anchors) {
      this.at += 2;
      return [assertion(anchors[ch]!)];
    }
    const perl = this.perlClass(flags);
    if (perl) return [setAtom(perl)];
    return [literal(this.escapedChar(), flags)];
  }

  // `\d`, `\s`, `\w` or a capital one here, as a set; null when the escape is none of them.
  private perlClass(flags: Flags): CodeSet | null {
    const ch = this.p[this.at + 1];
    if (ch === undefined || !'dDsSwW'.includes(ch)) return null;
    this.at += 2;
    return named(PERL_CLASSES[ch.toLowerCase()]!, ch !== ch.toLowerCase(), flags);
  }

  // One character written as an escape (the backslash at `at`): control letters, octal, hex, or punctuation.
  private escapedChar(): number {
    const ch = this.p[this.at + 1];
    if (ch === undefined) return refuse('trailing \\');
    this.at += 2;
    if (ch >= '1' && ch <= '7' && !isOctal(this.p[this.at]))
      refuse('backreferences are not supported');
    if (ch >= '0' && ch <= '7') {
      let digits = ch;
      while (digits.length < 3 && isOctal(this.p[this.at])) digits += this.p[this.at++];
      return parseInt(digits, 8);
    }
    if (ch === 'x') return this.hexChar();
    if (ch in CONTROL_ESCAPES) return CONTROL_ESCAPES[ch]!;
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80 && !isAsciiAlnum(ch)) return cp;
    return refuse(`invalid escape sequence: \\${ch}`);
  }

  private hexChar(): number {
    const braced = /^\{([0-9A-Fa-f]+)\}/.exec(this.p.slice(this.at));
    const two = /^[0-9A-Fa-f]{2}/.exec(this.p.slice(this.at));
    const digits = braced ? braced[1]! : two ? two[0] : refuse('invalid escape sequence: \\x');
    const cp = parseInt(digits, 16);
    if (cp > MAX_CODE_POINT) refuse('invalid escape sequence: \\x');
    this.at += braced ? braced[0].length : 2;
    return cp;
  }

  private group(flags: Flags): Atom[] {
    const rest = this.p.slice(this.at + 1);
    if (rest.startsWith('?P<') || (rest.startsWith('?<') && !/^\?<[=!]/.test(rest))) {
      const m = /^\?P?<(\w+)>/.exec(rest);
      if (!m) refuse('invalid named capture group');
      const name = m![1]!;
      if (this.names.has(name)) refuse(`duplicate capture group name ${name}`);
      this.names.add(name);
      this.at += 1 + m![0].length;
      return [this.capture(flags)];
    }
    if (rest.startsWith('?:')) {
      this.at += 3;
      return [this.closed('(?:', flags)];
    }
    if (rest.startsWith('?')) {
      const m = /^\?([imsU]*)(?:-([imsU]*))?([:)])/.exec(rest);
      if (!m || (m[1] === '' && m[2] === undefined) || m[2] === '')
        return refuse('invalid or unsupported Perl syntax');
      const scoped = { ...flags };
      for (const f of m[1]!) scoped[f as keyof Flags] = true;
      for (const f of m[2] ?? '') scoped[f as keyof Flags] = false;
      this.at += 1 + m[0].length;
      if (m[3] === ')') {
        Object.assign(flags, scoped);
        return [];
      }
      return [this.closed('(?:', scoped)];
    }
    this.at++;
    return [this.capture(flags)];
  }

  private capture(flags: Flags): Atom {
    this.groups++;
    return this.closed('(', flags);
  }

  // A group's body up to its `)`, written inside `open` and a `)`.
  private closed(open: string, flags: Flags): Atom {
    const body = this.alternation(flags);
    if (this.p[this.at] !== ')') refuse('missing closing )');
    this.at++;
    return { source: `${open}${body.source})`, bare: true, counts: body.counts };
  }

  private charClass(flags: Flags): Atom {
    this.at++;
    const negated = this.p[this.at] === '^';
    if (negated) this.at++;
    const parts: CodeSet[] = [];
    for (let first = true; ; first = false) {
      if (this.at >= this.p.length) refuse('missing closing ]');
      if (this.p[this.at] === ']' && !first) break;
      parts.push(this.classItem(flags));
    }
    this.at++;
    let set = unionSets(...parts);
    if (flags.i) set = foldSet(set);
    return setAtom(negated ? complementSet(set) : set);
  }

  // One item of a class: an ASCII class, a Perl class, a range, or one character.
  private classItem(flags: Flags): CodeSet {
    const posix = /^\[:(\^?)(\w+):\]/.exec(this.p.slice(this.at));
    if (posix) {
      if (!Object.hasOwn(POSIX_CLASSES, posix[2]!)) refuse('invalid character class range');
      this.at += posix[0].length;
      return named(POSIX_CLASSES[posix[2]!]!, posix[1] === '^', flags);
    }
    const perl = this.perlClass(flags);
    if (perl) return perl;
    const lo = this.classChar();
    if (this.p[this.at] !== '-' || this.at + 1 >= this.p.length || this.p[this.at + 1] === ']')
      return charSet(lo);
    this.at++;
    const hi = this.classChar();
    if (hi < lo) refuse('invalid character class range');
    return codeSet([[lo, hi]]);
  }

  private classChar(): number {
    return this.p[this.at] === '\\' ? this.escapedChar() : this.codePoint();
  }
}

// A named class, folded when (?i) is on, then complemented when negated (RE2 folds the positive first).
function named(positive: CodeSet, negated: boolean, flags: Flags): CodeSet {
  const set = flags.i ? foldSet(positive) : positive;
  return negated ? complementSet(set) : set;
}

const setAtom = (set: CodeSet): Atom => ({ source: setSource(set), bare: true, counts: 1 });
const assertion = (source: string): Atom => ({ source, bare: false, counts: 1 });

// One character: as itself (escaped where JavaScript reads it as syntax), or under (?i) its case orbit as a class.
function literal(cp: number, flags: Flags): Atom {
  if (flags.i) {
    const folded = foldSet(charSet(cp));
    if (folded.length > 2 || folded[0] !== folded[1]) return setAtom(folded);
  }
  const ch = String.fromCodePoint(cp);
  return { source: SYNTAX.has(ch) ? `\\${ch}` : ch, bare: true, counts: 1 };
}

/** An RE2 pattern as JavaScript for the `u` flag, or why RE2 refuses it. */
export function translateRe2(pattern: string): Re2Pattern | Re2Refusal {
  try {
    return new Translator(pattern).run();
  } catch (e) {
    if (e instanceof Refused) return { why: e.message };
    throw e;
  }
}
