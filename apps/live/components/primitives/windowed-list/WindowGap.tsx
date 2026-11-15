// The room a long list leaves for rows it has not drawn (docs/specs/013-workspace/explorer-structure.md "Long lists"):
// as tall as those rows, hidden from assistive technology, and free of the list's own borders, cascade and gaps' extra
// (a grid's room spans every column). A table's room is a row with one cell across.
import { cloneElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { WindowSegment } from './window-range';

const ROOM: CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
  animation: 'none',
  gridColumn: '1 / -1',
};

export function WindowGap({
  as,
  height,
  columns = 1,
}: {
  as: 'li' | 'div' | 'tr';
  height: number;
  columns?: number;
}) {
  const style = { ...ROOM, height };
  if (as === 'tr')
    return (
      <tr aria-hidden="true" data-window-gap="" style={ROOM}>
        <td colSpan={columns} style={style} />
      </tr>
    );
  const Tag = as;
  return <Tag aria-hidden="true" data-window-gap="" style={style} />;
}

/**
 * A window's children as one flat array, rows keyed by the host and gaps by their place, so a row moving between
 * runs (pinned, then back in view) keeps its element, and the focus in it.
 */
export function windowChildren(
  segments: readonly WindowSegment[],
  row: (index: number) => ReactNode,
  gap: (height: number) => ReactElement,
): ReactNode[] {
  const out: ReactNode[] = [];
  for (const s of segments) {
    if (s.kind === 'gap') out.push(cloneElement(gap(s.height), { key: s.key }));
    else for (let i = s.from; i < s.to; i += 1) out.push(row(i));
  }
  return out;
}
