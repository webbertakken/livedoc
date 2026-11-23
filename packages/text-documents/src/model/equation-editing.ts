// Writing inside an equation's box (docs/specs/034-text-documents/objects.md "Equations in the editor"): the caret
// between two nodes of a row, typing, typed shortcuts, moving and removing, each a pure step from one equation and
// caret to the next, so the editor only draws and dispatches.
import { equationShortcut } from './equation-symbols';
import {
  childRowKeys,
  childRows,
  Equations,
  withChildRow,
  type MathNode,
  type MathRow,
  type MathStep,
} from './equations';

/** The caret: the row it stands in, by its steps from the equation's row, and how many of the row's nodes are before it. */
export type MathCaret = { readonly path: readonly MathStep[]; readonly offset: number };
/** An equation and its caret after a step. */
export type MathEdit = { readonly math: MathRow; readonly caret: MathCaret };

const SHORTCUT_LETTER = /^[A-Za-z]$/;

/** The row a path names; an empty row past what the equation holds. */
function rowAt(math: MathRow, path: readonly MathStep[]): MathRow {
  let row = math;
  for (const step of path) {
    const node = row[step.node];
    const rows = node ? childRows(node) : [];
    row = rows[step.row] ?? [];
  }
  return row;
}

/** The equation with the row a path names replaced. */
function withRow(math: MathRow, path: readonly MathStep[], next: MathRow): MathRow {
  if (path.length === 0) return next;
  const [step, ...rest] = path as [MathStep, ...MathStep[]];
  const node = math[step.node]!;
  const inner = withRow(childRows(node)[step.row]!, rest, next);
  return math.map((n, i) => (i === step.node ? withChildRow(node, step.row, inner) : n));
}

const splice = (
  row: MathRow,
  at: number,
  remove: number,
  insert: readonly MathNode[] = [],
): MathRow => [...row.slice(0, at), ...insert, ...row.slice(at + remove)];

/** The first empty row of a node, in reading order, if any. */
const firstEmptyRow = (node: MathNode): number => childRows(node).findIndex((r) => r.length === 0);

/** A caret standing in a row that holds it: the equation's end otherwise. */
function within(math: MathRow, caret: MathCaret): MathCaret {
  let row = math;
  for (const step of caret.path) {
    const node = row[step.node];
    const rows = node ? childRows(node) : [];
    if (!rows[step.row]) return { path: [], offset: math.length };
    row = rows[step.row]!;
  }
  return caret.offset >= 0 && caret.offset <= row.length
    ? caret
    : { path: [], offset: math.length };
}

/** Nodes written at the caret, the caret after them, or in the first empty row of the last when it has one. */
function insert(edit: MathEdit, nodes: readonly MathNode[]): MathEdit {
  const { path, offset } = edit.caret;
  const math = withRow(edit.math, path, splice(rowAt(edit.math, path), offset, 0, nodes));
  const last = nodes[nodes.length - 1];
  const empty = last ? firstEmptyRow(last) : -1;
  if (last && empty >= 0)
    return {
      math,
      caret: { path: [...path, { node: offset + nodes.length - 1, row: empty }], offset: 0 },
    };
  return { math, caret: { path, offset: offset + nodes.length } };
}

/** A shortcut before the caret (`\` and its letters) as what it stands for; none when there is none it knows. */
function shortcut(edit: MathEdit): MathEdit | undefined {
  const { path, offset } = edit.caret;
  const row = rowAt(edit.math, path);
  let start = offset;
  while (start > 0) {
    const node = row[start - 1]!;
    if (node.kind !== 'identifier' || !SHORTCUT_LETTER.test(node.text)) break;
    start -= 1;
  }
  const slash = row[start - 1];
  if (start === offset || slash?.kind !== 'operator' || slash.text !== '\\') return undefined;
  const name = row
    .slice(start, offset)
    .map((n) => (n as { text: string }).text)
    .join('');
  const node = equationShortcut(name);
  if (!node) return undefined;
  const removed = withRow(edit.math, path, splice(row, start - 1, offset - start + 1));
  return insert({ math: removed, caret: { path, offset: start - 1 } }, [node]);
}

/** `^` or `_`: the node before the caret becomes a script's base, the caret in the script. */
function script(edit: MathEdit, which: 'sup' | 'sub'): MathEdit {
  const { path } = edit.caret;
  let { offset } = edit.caret;
  let row = rowAt(edit.math, path);
  // Google's help types them after `\`: the backslash is taken with them.
  const before = row[offset - 1];
  if (before?.kind === 'operator' && before.text === '\\') {
    row = splice(row, offset - 1, 1);
    offset -= 1;
  }
  const base = row[offset - 1];
  if (base?.kind === 'scripts' && !base[which]) {
    const node: MathNode = { ...base, [which]: [] };
    const math = withRow(edit.math, path, splice(row, offset - 1, 1, [node]));
    return {
      math,
      caret: {
        path: [...path, { node: offset - 1, row: childRowKeys(node).indexOf(which) }],
        offset: 0,
      },
    };
  }
  const node: MathNode = { kind: 'scripts', base: base ? [base] : [], [which]: [] };
  const at = base ? offset - 1 : offset;
  const math = withRow(edit.math, path, splice(row, at, base ? 1 : 0, [node]));
  return { math, caret: { path: [...path, { node: at, row: 1 }], offset: 0 } };
}

/** Rows the caret moves between with Up and Down, by the node's kind and the row it stands in. */
const VERTICAL: Readonly<Record<string, Readonly<Record<string, { up?: string; down?: string }>>>> =
  {
    fraction: { numerator: { down: 'denominator' }, denominator: { up: 'numerator' } },
    scripts: { base: { up: 'sup', down: 'sub' }, sub: { up: 'sup' }, sup: { down: 'sub' } },
    'large-operator': {
      body: { up: 'upper', down: 'lower' },
      lower: { up: 'upper' },
      upper: { down: 'lower' },
    },
    'under-over': {
      base: { up: 'over', down: 'under' },
      under: { up: 'over' },
      over: { down: 'under' },
    },
  };

/** A structure undone: its rows' content, in reading order, in its place; the caret at a row's content's start or end. */
function dissolve(edit: MathEdit, atEnd: boolean): MathEdit {
  const path = edit.caret.path;
  const step = path[path.length - 1]!;
  const parent = path.slice(0, -1);
  const row = rowAt(edit.math, parent);
  const rows = childRows(row[step.node]!);
  const before = rows.slice(0, step.row).reduce((n, r) => n + r.length, 0);
  const math = withRow(edit.math, parent, splice(row, step.node, 1, rows.flat()));
  const offset = step.node + before + (atEnd ? rows[step.row]!.length : 0);
  return { math, caret: { path: parent, offset } };
}

export const EquationEditing = {
  /** The caret at the equation's start or end, as the arrow keys bring it in. */
  start: (): MathCaret => ({ path: [], offset: 0 }),
  end: (math: MathRow): MathCaret => ({ path: [], offset: math.length }),
  /** A caret kept where it can stand after the equation changed under it. */
  within,
  /** The row the caret stands in. */
  rowAt,

  /** A typed character: a token, a script (`^`, `_`), or, a space, the shortcut before the caret written. */
  type: (edit: MathEdit, char: string): MathEdit => {
    if (char === ' ') return shortcut(edit) ?? edit;
    if (char === '^') return script(edit, 'sup');
    if (char === '_') return script(edit, 'sub');
    return Equations.within([...edit.math, Equations.token(char)])
      ? insert(edit, [Equations.token(char)])
      : edit;
  },

  /** A symbol or structure written at the caret (the toolbar's), the caret in its first empty row if it has one. */
  insert: (edit: MathEdit, node: MathNode): MathEdit =>
    Equations.within([...edit.math, node]) ? insert(edit, [node]) : edit,

  /** Right: over a token, into a structure, through its rows and out; 'after' past the equation's end. */
  right: (math: MathRow, caret: MathCaret): MathCaret | 'after' => {
    const row = rowAt(math, caret.path);
    if (caret.offset < row.length) {
      const node = row[caret.offset]!;
      if (childRows(node).length > 0)
        return { path: [...caret.path, { node: caret.offset, row: 0 }], offset: 0 };
      return { path: caret.path, offset: caret.offset + 1 };
    }
    if (caret.path.length === 0) return 'after';
    const step = caret.path[caret.path.length - 1]!;
    const parent = caret.path.slice(0, -1);
    const count = childRows(rowAt(math, parent)[step.node]!).length;
    if (step.row + 1 < count)
      return { path: [...parent, { node: step.node, row: step.row + 1 }], offset: 0 };
    return { path: parent, offset: step.node + 1 };
  },

  /** Left: Right mirrored; 'before' past the equation's start. */
  left: (math: MathRow, caret: MathCaret): MathCaret | 'before' => {
    const row = rowAt(math, caret.path);
    if (caret.offset > 0) {
      const node = row[caret.offset - 1]!;
      const rows = childRows(node);
      if (rows.length > 0)
        return {
          path: [...caret.path, { node: caret.offset - 1, row: rows.length - 1 }],
          offset: rows[rows.length - 1]!.length,
        };
      return { path: caret.path, offset: caret.offset - 1 };
    }
    if (caret.path.length === 0) return 'before';
    const step = caret.path[caret.path.length - 1]!;
    const parent = caret.path.slice(0, -1);
    if (step.row > 0) {
      const previous = childRows(rowAt(math, parent)[step.node]!)[step.row - 1]!;
      return { path: [...parent, { node: step.node, row: step.row - 1 }], offset: previous.length };
    }
    return { path: parent, offset: step.node };
  },

  /** Up or Down: to the end of the row above or below in the nearest structure that has one; else where it was. */
  vertical: (math: MathRow, caret: MathCaret, direction: 'up' | 'down'): MathCaret => {
    for (let depth = caret.path.length; depth > 0; depth -= 1) {
      const step = caret.path[depth - 1]!;
      const parent = caret.path.slice(0, depth - 1);
      const node = rowAt(math, parent)[step.node]!;
      const keys = childRowKeys(node);
      const target = VERTICAL[node.kind]?.[keys[step.row]!]?.[direction];
      const row = target === undefined ? -1 : keys.indexOf(target);
      if (row >= 0)
        return {
          path: [...parent, { node: step.node, row }],
          offset: childRows(node)[row]!.length,
        };
    }
    return caret;
  },

  /**
   * Backspace: the token before the caret removed, or the caret into the structure before it; at a row's start, the
   * structure holding it undone. 'remove' for an empty equation; none at a full equation's start.
   */
  backspace: (edit: MathEdit): MathEdit | 'remove' | undefined => {
    const { path, offset } = edit.caret;
    const row = rowAt(edit.math, path);
    if (offset > 0) {
      const node = row[offset - 1]!;
      const rows = childRows(node);
      if (rows.length > 0)
        return {
          math: edit.math,
          caret: {
            path: [...path, { node: offset - 1, row: rows.length - 1 }],
            offset: rows[rows.length - 1]!.length,
          },
        };
      return {
        math: withRow(edit.math, path, splice(row, offset - 1, 1)),
        caret: { path, offset: offset - 1 },
      };
    }
    if (path.length === 0) return edit.math.length === 0 ? 'remove' : undefined;
    return dissolve(edit, false);
  },

  /** Delete: Backspace mirrored forward. */
  delete: (edit: MathEdit): MathEdit | 'remove' | undefined => {
    const { path, offset } = edit.caret;
    const row = rowAt(edit.math, path);
    if (offset < row.length) {
      const node = row[offset]!;
      if (childRows(node).length > 0)
        return { math: edit.math, caret: { path: [...path, { node: offset, row: 0 }], offset: 0 } };
      return { math: withRow(edit.math, path, splice(row, offset, 1)), caret: edit.caret };
    }
    if (path.length === 0) return edit.math.length === 0 ? 'remove' : undefined;
    return dissolve(edit, true);
  },
} as const;
