// The title pill shown above (or below) a floating toolbar /
// selection popover, on the side opposite where the box is anchored. Shared by
// FloatingToolbar + SelectionPopover so the pill styling stays in lockstep; the
// `placeAbove` side comes from the same useEdgeAwarePlacement hook that drives
// the box's own position.
export function FloatingTitle({ title, placeAbove }: { title: string; placeAbove: boolean }) {
  return (
    <span
      className={`inline-flex items-center pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-control bg-white/90 px-2 py-0.5 text-supporting text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:ring-0 ${
        placeAbove ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      <span className="text-optical-line">{title}</span>
    </span>
  );
}
