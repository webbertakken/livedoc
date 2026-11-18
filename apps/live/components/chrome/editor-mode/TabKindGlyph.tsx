'use client';

import { tabKindName } from '@livedoc/document';
import { HoverCard } from '@livedoc/ui';
import type { CSSProperties } from 'react';
import type { EditorModeTab } from '@/lib/editor-mode-store';
import { TabModeIcon } from './TabModeIcon';

// The tab's glyph named by its kind (docs/specs/007-editor/editor-modes.md "A tab's kind is always findable"): its hover
// card says what the tab is ("Board tab", "Diagram tab, in Sketch mode"). `named`: the glyph stands alone, so it names
// the kind to a screen reader itself; inside a control (a tab list row) the control says it instead, so the glyph
// stays out of the control's name.
export function TabKindGlyph({
  tab,
  style,
  named = true,
}: {
  tab: EditorModeTab;
  style?: CSSProperties;
  named?: boolean;
}) {
  const name = tabKindName(tab);
  return (
    <HoverCard title={name} className="shrink-0">
      <span
        data-tab-kind-glyph=""
        {...(named ? { role: 'img', 'aria-label': name } : { 'aria-hidden': true })}
        className="inline-flex"
      >
        <TabModeIcon tab={tab} {...(style ? { style } : {})} />
      </span>
    </HoverCard>
  );
}
