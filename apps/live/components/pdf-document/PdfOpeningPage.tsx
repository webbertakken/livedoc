// A PDF opening (docs/specs/035-pdf-documents/opening.md): a page-shaped placeholder on the surface's ground, so
// nothing shifts when page one arrives, and a status that says what is under way.
export function PdfOpeningPage() {
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-hidden px-6 py-6" aria-busy="true">
      <div
        role="status"
        className="aspect-[612/792] w-full max-w-[816px] bg-(--pdf-paper) shadow-sm outline outline-1 outline-(--office-line)"
      >
        <span className="sr-only">Opening this PDF…</span>
      </div>
    </div>
  );
}
