// A document kind's plate on the New Document step (docs/specs/007-editor/new-document-route.md "Choosing a mode"):
// with no templates of its own yet, a kind shows a drawing of the blank it makes, in the place a mode's fan of previews
// takes and at its height: a page of lines for a text document, a grid for a spreadsheet, a page with a folded corner
// for a PDF document. Decorative: the card's name and line say what it makes.
import type { NewDocumentKind } from '@livedoc/templates';

const PAGE = 'fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600';
const INK = 'fill-slate-300 dark:fill-slate-600';
const ACCENT: Record<NewDocumentKind, string> = {
  'text-document': 'fill-blue-500/70 dark:fill-blue-400/70',
  spreadsheet: 'fill-emerald-500/70 dark:fill-emerald-400/70',
  'pdf-document': 'fill-red-500/70 dark:fill-red-400/70',
};

export function KindPlate({ kind }: { kind: NewDocumentKind }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 80"
      className="h-20 w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {kind === 'text-document' ? <TextPage /> : kind === 'spreadsheet' ? <Grid /> : <PdfPage />}
    </svg>
  );
}

function TextPage() {
  const lines = [22, 30, 38, 46, 54];
  return (
    <g>
      <rect x="58" y="6" width="44" height="68" rx="2" strokeWidth="1" className={PAGE} />
      <rect x="64" y="13" width="22" height="4" rx="1" className={ACCENT['text-document']} />
      {lines.map((y, i) => (
        <rect
          key={y}
          x="64"
          y={y}
          width={i === lines.length - 1 ? 20 : 32}
          height="2.5"
          rx="1"
          className={INK}
        />
      ))}
    </g>
  );
}

function Grid() {
  const cols = [44, 62, 80, 98];
  const rows = [16, 26, 36, 46, 56];
  return (
    <g>
      <rect x="40" y="8" width="80" height="62" rx="2" strokeWidth="1" className={PAGE} />
      <rect x="40.5" y="8.5" width="79" height="7" className={ACCENT.spreadsheet} />
      {cols.map((x) =>
        rows.map((y) => (
          <rect key={`${x}:${y}`} x={x} y={y + 2} width="14" height="2.5" rx="1" className={INK} />
        )),
      )}
    </g>
  );
}

function PdfPage() {
  return (
    <g>
      <path d="M58 6h34l10 10v58H58z" strokeWidth="1" className={PAGE} />
      <path
        d="M92 6v10h10"
        strokeWidth="1"
        className="fill-none stroke-slate-300 dark:stroke-slate-600"
      />
      <rect x="64" y="52" width="32" height="12" rx="2" className={ACCENT['pdf-document']} />
    </g>
  );
}
