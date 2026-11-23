// The size LibreOffice draws an equation at (docs/specs/034-text-documents/objects.md "Equations in the formats",
// written): LibreOffice scales a formula into the frame it reads and works out no size of its own, so the frame is
// written to hold it, by LibreOffice Math's own measures at its base size.
import { INTEGRALS, type MathNode, type MathRow } from '../model/equations';

/** A row's box in ems of its font: width, and height from top to bottom, after LibreOffice Math's own layout. */
type Extent = { readonly width: number; readonly height: number };

/** One line of maths: LibreOffice Math's line at its base size, in ems. */
const LINE = 1.1125;
/** How large a script, limit or index is drawn beside its base. */
const SCRIPT = 0.6;

const TOKEN_WIDTH: Readonly<Record<string, number>> = {
  identifier: 0.58,
  number: 0.5,
  operator: 0.7,
  text: 0.4,
};

function tokenExtent(kind: string, text: string): Extent {
  const chars = [...text].length;
  // A word drawn upright (sin, lim) is narrower a letter, with a function's space after it.
  const width =
    kind === 'identifier' && chars > 1 ? chars * 0.5 + 0.25 : chars * TOKEN_WIDTH[kind]!;
  return { width, height: LINE };
}

function rowExtent(row: MathRow): Extent {
  if (row.length === 0) return { width: 0, height: LINE };
  return row
    .map(nodeExtent)
    .reduce((a, b) => ({ width: a.width + b.width, height: Math.max(a.height, b.height) }));
}

const scaled = (row: MathRow): Extent => {
  const { width, height } = rowExtent(row);
  return { width: width * SCRIPT, height: height * SCRIPT };
};

function nodeExtent(node: MathNode): Extent {
  switch (node.kind) {
    case 'fraction': {
      const [n, d] = [rowExtent(node.numerator), rowExtent(node.denominator)];
      return { width: Math.max(n.width, d.width) + 0.16, height: n.height + d.height + 0.15 };
    }
    case 'scripts': {
      const base = rowExtent(node.base);
      const sub = node.sub && scaled(node.sub);
      const sup = node.sup && scaled(node.sup);
      const raise = (s: Extent | undefined) => (s ? Math.max(0.14, s.height - 0.53) : 0);
      return {
        width: base.width + Math.max(sub?.width ?? 0, sup?.width ?? 0),
        height: base.height + raise(sup) + raise(sub),
      };
    }
    case 'root': {
      const radicand = rowExtent(node.radicand);
      const index = node.index ? scaled(node.index) : undefined;
      return {
        width: radicand.width + 0.56 + Math.max(0, (index?.width ?? 0) - 0.3),
        height: radicand.height + (index ? 0.2 : 0.09),
      };
    }
    case 'large-operator': {
      const [lower, upper, body] = [scaled(node.lower), scaled(node.upper), rowExtent(node.body)];
      const limits = (r: MathRow, e: Extent) => (r.length > 0 ? e.height : 0);
      if (INTEGRALS.has(node.operator))
        return {
          width: 0.6 + Math.max(lower.width, upper.width) + body.width + 0.1,
          height: Math.max(
            body.height,
            1.95 + (node.lower.length > 0 ? 0.45 : 0) + (node.upper.length > 0 ? 0.45 : 0),
          ),
        };
      return {
        width: Math.max(1.03, lower.width, upper.width) + body.width + 0.3,
        height: Math.max(body.height, 1.4 + limits(node.lower, lower) + limits(node.upper, upper)),
      };
    }
    case 'fence': {
      const body = rowExtent(node.body);
      const sides = (node.open ? 0.3 : 0) + (node.close ? 0.3 : 0);
      return {
        width: body.width + sides + (body.height > LINE ? 0.18 : 0),
        height: body.height * 1.05 + 0.06,
      };
    }
    case 'accent': {
      const base = rowExtent(node.base);
      return { width: base.width, height: base.height + 0.25 };
    }
    case 'under-over': {
      const base = rowExtent(node.base);
      const under = node.under ? scaled(node.under) : undefined;
      const over = node.over ? scaled(node.over) : undefined;
      return {
        width: Math.max(base.width, under?.width ?? 0, over?.width ?? 0) + 0.25,
        height: base.height + (under?.height ?? 0) + (over?.height ?? 0),
      };
    }
    default:
      return tokenExtent(node.kind, node.text);
  }
}

/**
 * The size LibreOffice draws an equation at, in points, at its base size (12 pt): its frame must hold it, as LibreOffice
 * scales the maths into the frame it reads and works out no size of its own (default; within a fifth of its own).
 */
export function odfEquationSize(row: MathRow): { width: number; height: number } {
  const { width, height } = rowExtent(row);
  const round = (n: number) => Math.round(n * ODF_MATHS_SIZE * 100) / 100;
  return { width: round(Math.max(width, 0.5)), height: round(height) };
}

/** LibreOffice Math's base size in points: the size it draws ODF maths at. */
export const ODF_MATHS_SIZE = 12;
