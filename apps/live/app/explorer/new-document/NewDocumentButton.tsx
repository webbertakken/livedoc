'use client';

// The Explorer's New Document (docs/specs/013-workspace/new-document-menu.md "The button"): a split button whose face
// makes the last blank at once and whose caret opens the menu of every blank (NewDocumentMenu, a sheet on a phone).
// Every choice goes through startNewDocument; New Folder rides in the menu where the section offers it.
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { newDocumentBlankOf, type NewDocumentBlankId, type TemplateKind } from '@livedoc/templates';
import { Button, Glyph } from '@livedoc/ui';
import { PlusIcon } from '@/components/primitives/explorer-icons';
import { useIsMobileViewport } from '@/hooks/ui/useIsMobileViewport';
import { useLastBlank, writeLastBlank } from '@/lib/new-document/last-blank';
import { track } from '@/lib/telemetry';
import { BlankGlyph } from './blank-glyphs';
import {
  prefetchNewDocumentOpen,
  startNewDocument,
  type NewDocumentChoice,
  type NewDocumentRequest,
} from './start-new-document';

// The menu and its previews are their own chunk, fetched when the pointer or focus reaches the button.
const loadMenu = () => import('./NewDocumentMenu');
const loadSheet = () => import('./NewDocumentSheet');
const NewDocumentMenu = dynamic(loadMenu, { ssr: false });
const NewDocumentSheet = dynamic(loadSheet, { ssr: false });

const CHOICE_TELEMETRY: Record<NewDocumentChoice, string> = {
  blank: 'NewDocumentBlank',
  template: 'NewDocumentTemplate',
};

function CaretDownIcon() {
  return (
    <Glyph size={10} units={16}>
      <path d="M4 6l4 4 4-4" />
    </Glyph>
  );
}

export function NewDocumentButton({
  place,
  onCreateFolder,
  folderLabel,
}: {
  place: NewDocumentRequest['place'];
  onCreateFolder?: (() => void) | undefined;
  folderLabel?: string | undefined;
}) {
  const last = useLastBlank();
  const lastBlank = newDocumentBlankOf(last)!;
  const phone = useIsMobileViewport();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const prefetch = useCallback(() => {
    void (phone ? loadSheet() : loadMenu()).catch(() => {});
    // And what opening a document needs, so the first click opens at once.
    prefetchNewDocumentOpen();
  }, [phone]);

  const choose = useCallback(
    (id: NewDocumentBlankId, choice: NewDocumentChoice, template: TemplateKind) => {
      setOpen(false);
      writeLastBlank(id);
      track('UI', 'Used', CHOICE_TELEMETRY[choice]);
      startNewDocument({
        choice,
        blank: id,
        template,
        place,
      });
    },
    [place],
  );

  const openMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    track('UI', 'Opened', 'NewDocumentMenu');
    setOpen(true);
  };

  const Menu = phone ? NewDocumentSheet : NewDocumentMenu;
  return (
    <div className="inline-flex rounded-md shadow-sm" onPointerEnter={prefetch} onFocus={prefetch}>
      <Button
        size="xs"
        aria-label={`New ${lastBlank.name}`}
        onClick={() => choose(last, 'blank', lastBlank.blank)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            openMenu();
          }
        }}
        className="gap-1.5 rounded-r-none pr-2.5"
      >
        <PlusIcon />
        {/* On a phone the name hides behind the blank's glyph; aria-label carries it. */}
        <span className="sm:hidden [&_span]:text-white">
          <BlankGlyph id={last} />
        </span>
        <span className="hidden sm:inline">New {lastBlank.name}</span>
      </Button>
      <Button
        ref={setAnchor}
        size="xs"
        aria-label="More new document choices"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={openMenu}
        className="rounded-l-none border-l border-white/25 px-1.5!"
      >
        <CaretDownIcon />
      </Button>
      {open ? (
        <Menu
          anchor={anchor}
          initial={last}
          onChoose={choose}
          onClose={() => setOpen(false)}
          folderLabel={folderLabel}
          onCreateFolder={
            onCreateFolder
              ? () => {
                  setOpen(false);
                  onCreateFolder();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
