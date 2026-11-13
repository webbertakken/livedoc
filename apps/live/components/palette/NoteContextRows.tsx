'use client';

import {
  MenuAccordionSection,
  MenuActionRow,
  MenuGroupSeparator,
} from '@/components/primitives/PortalMenu';
import { CheckIcon } from '@livedoc/ui';
import { ContextJoinIcon, ContextLeaveIcon } from './context-menu-icons';
import type { NoteContextsMenu } from './EditorContextMenu.types';

// A workshop note's candidate context in its menu (docs/specs/021-event-storming/candidate-contexts.md "Its notes
// change two ways"): Add to Context, listing the board's kept contexts by name (the one it is in checked, not offered),
// and Remove from Context when it is in one. Every row runs, then closes the menu.
export function NoteContextRows({
  menu,
  runAndClose,
  sectionProps,
}: {
  menu: NoteContextsMenu;
  runAndClose: (action: () => void) => () => void;
  sectionProps: (id: string) => { open: boolean; onToggle: () => void; flush: boolean };
}) {
  return (
    <>
      <MenuGroupSeparator />
      {menu.contexts.length > 0 ? (
        <MenuAccordionSection
          title="Add to Context"
          icon={<ContextJoinIcon />}
          {...sectionProps('es-context')}
        >
          {menu.contexts.map((c) => (
            <MenuActionRow
              key={c.id}
              // The context it is in is shown checked, not offered.
              icon={c.id === menu.currentId ? <CheckIcon size={14} /> : <ContextJoinIcon />}
              label={c.name}
              // Names read as written, not as an uppercase verb.
              plain
              disabled={c.id === menu.currentId}
              onClick={runAndClose(() => menu.onAdd(c.id))}
            />
          ))}
        </MenuAccordionSection>
      ) : null}
      {menu.currentId ? (
        <MenuActionRow
          icon={<ContextLeaveIcon />}
          label="Remove from Context"
          onClick={runAndClose(menu.onRemove)}
        />
      ) : null}
    </>
  );
}
