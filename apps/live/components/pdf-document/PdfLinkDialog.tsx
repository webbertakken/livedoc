'use client';

// What a press on a bookmark or a link says before, or instead of, following it
// (docs/specs/035-pdf-documents/reading-surface.md "Following a link"; security.md "Links and actions"): the shell's
// dialog, titled "Link". An address is shown as plain text and opened only on Open, in a new tab with no opener and
// no referrer; an address not opened, a path to another file and an action are said, never followed.
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { debugLog } from '@/lib/debug-log';
import { schemeOf, type PdfLinkOutcome } from '@/lib/pdf-document/pdf-link';

/** The outcomes a dialog says something of: every one but going and going nowhere. */
export type PdfLinkAsked = Exclude<PdfLinkOutcome, { kind: 'go' } | { kind: 'nowhere' }>;

const SAID: Record<PdfLinkAsked['kind'], string> = {
  ask: 'Open this address?',
  refused: 'This link can’t be opened here.',
  file: 'This link leads to another file, which LiveDoc can’t open.',
  action: 'This link asks for something LiveDoc never does.',
};

const copy = (text: string) => {
  void navigator.clipboard?.writeText(text).catch((error: unknown) => {
    debugLog('[pdf] link-copy-failed', String(error));
  });
};

export function PdfLinkDialog({
  asked,
  onClose,
}: {
  // What is asked or said; null while no link is pressed.
  asked: PdfLinkAsked | null;
  onClose: () => void;
}) {
  const text =
    asked?.kind === 'ask' || asked?.kind === 'refused'
      ? asked.address
      : asked?.kind === 'file'
        ? asked.path
        : null;
  const primary =
    asked?.kind === 'ask'
      ? {
          label: 'Open',
          onPress: () => {
            debugLog(`[pdf] link-opened scheme=${schemeOf(asked.address)}`);
            window.open(asked.address, '_blank', 'noopener,noreferrer');
            onClose();
          },
        }
      : asked?.kind === 'refused' || asked?.kind === 'file'
        ? {
            label: asked.kind === 'file' ? 'Copy path' : 'Copy address',
            onPress: () => {
              copy(text ?? '');
              onClose();
            },
          }
        : undefined;
  return (
    <OfficeDialog open={asked !== null} onClose={onClose} title="Link" primary={primary}>
      {asked ? (
        <>
          <p className="text-sm">{SAID[asked.kind]}</p>
          {text !== null ? (
            <p
              data-pdf-link-text
              className="mt-3 rounded-md border border-(--office-line) px-3 py-2 font-mono text-sm break-all select-all"
            >
              {text}
            </p>
          ) : null}
        </>
      ) : null}
    </OfficeDialog>
  );
}
