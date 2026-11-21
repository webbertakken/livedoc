// Function names in capitals (docs/specs/029-sheets/formulas.md "Locale", D80): `=sum(a1)` is kept as `=SUM(A1)`. A
// name no function has (a LAMBDA's own, a typo) keeps the case it was typed in. Every character stays in its place.
import { isKnownFunction } from './registry';
import { tokenize } from './tokens';

/** A typed formula (`=…`) with each known function's name in capitals. */
export function capitalFunctionNames(text: string): string {
  if (!text.startsWith('=')) return text;
  const tokens = tokenize(text.slice(1), 1).filter((t) => t.k !== 'ws');
  let out = text;
  tokens.forEach((t, i) => {
    if (t.k !== 'ident' || tokens[i + 1]?.k !== 'lparen' || !isKnownFunction(t.v)) return;
    out = out.slice(0, t.start) + t.v.toUpperCase() + out.slice(t.end);
  });
  return out;
}
