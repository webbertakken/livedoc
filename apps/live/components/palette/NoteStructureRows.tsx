'use client';

import { MenuActionRow, MenuGroupSeparator } from '@/components/primitives/PortalMenu';
import type { NoteStructureMenu } from '@/lib/note-structure-menu';
import { AnswerIcon, LaneNameIcon, PivotalIcon } from './context-menu-icons';

// The board's structure in a workshop note's menu (docs/specs/021-event-storming/board-structure.md "Pivotal events",
// "Lane names", "Hotspot answers"): a domain event is marked pivotal or unmarked, a hotspot's answer is opened for
// typing, and the lane the note stands on is named. Every row runs, then closes the menu.
export function NoteStructureRows({
  menu,
  runAndClose,
}: {
  menu: NoteStructureMenu;
  runAndClose: (action: () => void) => () => void;
}) {
  return (
    <>
      <MenuGroupSeparator />
      {menu.pivotal ? (
        <MenuActionRow
          icon={<PivotalIcon />}
          label={menu.pivotal.on ? 'Unmark Pivotal' : 'Mark as Pivotal'}
          onClick={runAndClose(menu.pivotal.onToggle)}
        />
      ) : null}
      {menu.answer ? (
        <MenuActionRow
          icon={<AnswerIcon />}
          label={menu.answer.answered ? 'Edit Answer…' : 'Answer…'}
          onClick={runAndClose(menu.answer.onOpen)}
        />
      ) : null}
      <MenuActionRow
        icon={<LaneNameIcon />}
        label={menu.lane.named ? 'Rename This Lane' : 'Name This Lane'}
        onClick={runAndClose(menu.lane.onName)}
      />
    </>
  );
}
