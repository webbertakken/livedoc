'use client';

// The New Document menu on a phone (docs/specs/013-workspace/new-document-menu.md "On a phone"): a sheet from the
// bottom edge holding the list only. A row makes its blank; its Templates button swaps the sheet to that blank's pane,
// with Back. A command menu like the desktop's (useMenu), so it reads and closes the same way.
import { useState } from 'react';
import { NEW_DOCUMENT_BLANKS, type NewDocumentBlankId } from '@livedoc/templates';
import { lucideChevronLeft, lucideFileUp, lucideLayoutGrid } from '@livedoc/icons/lucide';
import { MenuTreeContext, lucideGlyph, useMenu } from '@livedoc/ui';
import { BottomSheet } from '@/components/primitives/BottomSheet';
import { FolderOutlineIcon } from '@/components/primitives/explorer-icons';
import { paneGroupsFor } from '@/lib/new-document/pane-groups';
import { BlankGlyph } from './blank-glyphs';
import { NewDocumentPane } from './NewDocumentPane';
import type { NewDocumentMenuProps } from './NewDocumentMenu';

const BackIcon = lucideGlyph(lucideChevronLeft, 16);
const GridIcon = lucideGlyph(lucideLayoutGrid, 16);
const FileUpIcon = lucideGlyph(lucideFileUp, 16);

const ROW =
  'flex min-h-11 items-center gap-3 px-4 text-left outline-none transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 dark:focus-visible:outline-brand-400';

export default function NewDocumentSheet({
  anchor,
  onChoose,
  onClose,
  folderLabel,
  onCreateFolder,
}: NewDocumentMenuProps) {
  const [shown, setShown] = useState<NewDocumentBlankId | null>(null);
  const { attach, tree, surfaceProps } = useMenu({
    onClose,
    trigger: anchor,
    label: 'New Document',
  });
  const blank = NEW_DOCUMENT_BLANKS.find((b) => b.id === shown);
  return (
    <>
      {/* Pressing outside the sheet closes it, as outside any menu. */}
      <div
        aria-hidden
        className="fixed inset-0 z-[var(--z-modal)] bg-slate-950/30"
        onClick={onClose}
      />
      <BottomSheet ref={attach} {...surfaceProps} onClose={onClose} zClassName="z-[var(--z-modal)]">
        <MenuTreeContext.Provider value={tree}>
          {blank ? (
            <>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setShown(null)}
                className={`${ROW} text-body text-slate-700 dark:text-slate-200`}
              >
                <BackIcon aria-hidden />
                Back
              </button>
              <div className="h-[50dvh]">
                <NewDocumentPane
                  blank={blank}
                  groups={paneGroupsFor(blank)}
                  onChoose={(template) => onChoose(blank.id, 'template', template)}
                  onChooseKind={(choice) => onChoose(blank.id, choice, blank.blank)}
                  onChooseTextTemplate={(id) => onChoose(blank.id, 'template', blank.blank, id)}
                />
              </div>
            </>
          ) : (
            <>
              {NEW_DOCUMENT_BLANKS.map((b) => (
                <div key={b.id} className="flex items-stretch">
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-label={`${b.name}, blank`}
                    onClick={() => onChoose(b.id, 'blank', b.blank)}
                    className={`${ROW} flex-1 text-body text-slate-800 pointer-coarse:text-[15px] dark:text-slate-100`}
                  >
                    <BlankGlyph id={b.id} />
                    {b.name}
                  </button>
                  {/* A kind without templates has no Templates; PDF document opens a file instead. */}
                  {b.kind === 'pdf-document' ? (
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      aria-label="Open a PDF file"
                      onClick={() => onChoose(b.id, 'file', b.blank)}
                      className={`${ROW} text-body text-slate-500 dark:text-slate-400`}
                    >
                      <FileUpIcon aria-hidden />
                      Open file
                    </button>
                  ) : b.templates ? (
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      aria-label={`${b.name} templates`}
                      onClick={() => setShown(b.id)}
                      className={`${ROW} text-body text-slate-500 dark:text-slate-400`}
                    >
                      <GridIcon aria-hidden />
                      Templates
                    </button>
                  ) : null}
                </div>
              ))}
              {onCreateFolder ? (
                <>
                  <div
                    role="separator"
                    className="my-1 border-t border-slate-200 dark:border-slate-800"
                  />
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={onCreateFolder}
                    className={`${ROW} text-body text-slate-700 pointer-coarse:text-[15px] dark:text-slate-200 [&_svg]:size-icon-row`}
                  >
                    <FolderOutlineIcon />
                    {folderLabel ?? 'New Folder'}
                  </button>
                </>
              ) : null}
            </>
          )}
        </MenuTreeContext.Provider>
      </BottomSheet>
    </>
  );
}
