// The choice grid's pictures (OfficeChoiceGrid): a list style's lines, a stamp's badge and a custom stamp's picture, drawn as the page draws
// them in small, so they are drawn art, off the chrome's sizing scale
// (docs/specs/004-interface-design/sizing.md "Shapes").
import type { OfficeGridBadge, OfficeGridLine, OfficeGridPicture } from './OfficeChoiceGrid';

const LEVEL_STEP_PX = 9;

export function ChoiceBadge({ badge }: { badge: OfficeGridBadge }) {
  return (
    <span
      aria-hidden="true"
      data-office-grid-badge=""
      className="flex w-full flex-col items-center justify-center gap-0.5 rounded-[4px] border-2 bg-(--pdf-paper) px-1 py-1 text-center leading-none"
      style={{ color: badge.colour, borderColor: badge.colour }}
    >
      <span className="text-[10px] font-bold">{badge.text}</span>
      {badge.detail ? <span className="text-[8px]">{badge.detail}</span> : null}
    </span>
  );
}

/** A custom stamp's picture on the page's paper, its name below; the paper alone while the picture is on its way. */
export function ChoicePicture({ picture }: { picture: OfficeGridPicture }) {
  return (
    <span aria-hidden="true" data-office-grid-picture="" className="flex w-full flex-col gap-0.5">
      <span className="flex min-h-0 flex-1 items-center justify-center rounded-[4px] bg-(--pdf-paper) p-0.5">
        {picture.src ? (
          <img src={picture.src} alt="" className="max-h-full max-w-full object-contain" />
        ) : null}
      </span>
      <span className="truncate text-center text-[10px] leading-none text-(--office-ink)">
        {picture.name}
      </span>
    </span>
  );
}

export function ChoiceLines({ lines }: { lines: readonly OfficeGridLine[] }) {
  return (
    <span aria-hidden="true" className="flex w-full flex-col gap-1.5">
      {lines.map((line, i) => (
        <span
          key={i}
          className="flex items-center gap-1 text-[11px] leading-none"
          style={{ paddingLeft: line.level * LEVEL_STEP_PX }}
        >
          {line.box ? (
            <span
              data-box={line.box}
              className="flex size-2.5 shrink-0 items-center justify-center rounded-[2px] border border-(--office-icon) text-[8px] leading-none"
            >
              {line.box === 'ticked' ? '✓' : ''}
            </span>
          ) : (
            <span className="min-w-3 shrink-0 text-(--office-ink)">{line.marker}</span>
          )}
          {line.word ? (
            <span className={`text-(--office-muted) ${line.word.struck ? 'line-through' : ''}`}>
              {line.word.text}
            </span>
          ) : (
            <span className="h-0.5 flex-1 rounded-full bg-(--office-line)" />
          )}
        </span>
      ))}
    </span>
  );
}
