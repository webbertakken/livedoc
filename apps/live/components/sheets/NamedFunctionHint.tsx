'use client';

// The argument hint inside a call of a named function (docs/specs/029-sheets/data-tools.md "Named ranges and named
// functions"): its call with the argument the caret is in shown bold, its description, and that argument's
// description and example as its maker wrote them.
import type { NamedFunction } from '@livedoc/sheets';
import { useSheetController } from './sheet-controller';

export function NamedFunctionHint({
  fn,
  index,
  separator,
}: {
  fn: NamedFunction;
  // The argument the caret is in (0-based); past the last, none is bold.
  index: number;
  separator: ',' | ';';
}) {
  const c = useSheetController();
  const hint = fn.hints?.[index] ?? null;
  const muted = { color: c.palette.muted };
  return (
    <div
      role="note"
      className="absolute left-0 top-full z-20 mt-1 w-80 rounded-menu border px-3 py-2 text-body shadow-lg"
      style={{
        backgroundColor: c.palette.surface,
        borderColor: c.palette.border,
        color: c.palette.text,
      }}
    >
      <div className="font-mono">
        {fn.name}(
        {fn.params.map((p, i) => (
          <span key={i} style={i === index ? { fontWeight: 700 } : muted}>
            {i > 0 ? `${separator} ` : ''}
            {p}
          </span>
        ))}
        )
      </div>
      {fn.description ? (
        <div className="mt-1" style={muted}>
          {fn.description}
        </div>
      ) : null}
      {hint?.description ? (
        <div className="mt-1">
          <span className="font-mono">{fn.params[index]}</span>: {hint.description}
        </div>
      ) : null}
      {hint?.example ? (
        <div className="mt-1 font-mono text-supporting" style={muted}>
          Example: {hint.example}
        </div>
      ) : null}
    </div>
  );
}
