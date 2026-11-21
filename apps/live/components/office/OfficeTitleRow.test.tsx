// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import type { Participant } from '@/lib/identity';
import type { OfficeCatalogue } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import type { OfficeChrome } from './office-chrome';
import type { OfficeSaveStatus } from './office-save-status';
import { OfficeTitleRow } from './OfficeTitleRow';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/components/chrome/AuthControls', () => ({
  AuthControls: ({ onOpenAccount }: { onOpenAccount: () => void }) => (
    <button type="button" onClick={onOpenAccount}>
      Account
    </button>
  ),
}));

const CATALOGUE: OfficeCatalogue = [
  {
    id: 'file',
    label: 'File',
    entries: [
      { kind: 'item', id: 'rename', label: 'Rename', level: 'edit', status: 'built' },
      { kind: 'item', id: 'move', label: 'Move', level: 'edit', status: 'built' },
      {
        kind: 'item',
        id: 'share-with-others',
        label: 'Share with others',
        level: 'edit',
        status: 'built',
      },
    ],
  },
];

const person = (id: string, name: string): Participant => ({
  id,
  name,
  color: '#0f766e',
  status: 'online',
});

function chromeOf(over: Partial<OfficeChrome> = {}): OfficeChrome {
  return {
    back: { kind: 'explorer' },
    rename: vi.fn(),
    renameNonce: 0,
    star: { starred: false, onToggle: vi.fn() },
    move: vi.fn(),
    share: { shareable: false, onOpen: vi.fn() },
    makeCopy: null,
    onOpenSettings: vi.fn(),
    onOpenAccount: vi.fn(),
    people: [],
    onOpenTab: vi.fn(),
    ...over,
  };
}

function Row({
  chrome,
  level = 'edit',
  onFollow,
}: {
  chrome: OfficeChrome | null;
  level?: AccessLevel;
  onFollow?: (id: string) => boolean;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={root}>
      <OfficeTitleRow
        name="Minutes"
        format=".ODT"
        formatTitle="OpenDocument format"
        problem={null}
        catalogue={CATALOGUE}
        level={level}
        actions={{}}
        shortcuts={TEXT_DOCUMENT_SHORTCUTS}
        keyScope={root}
        telemetryKind="TextDocument"
        chrome={chrome}
        tabId="t1"
        onFollow={onFollow}
      />
    </div>
  );
}

const openFile = () =>
  fireEvent.click(within(screen.getByRole('menubar')).getByRole('menuitem', { name: 'File' }));

// docs/specs/034-text-documents/editing-surface.md "The title row"; office-shell.md "Title row".
describe('OfficeTitleRow, the document parts', () => {
  it('draws the mark to the Explorer, the name field, star and move', () => {
    render(<Row chrome={chromeOf()} />);
    expect(screen.getByRole('link', { name: 'Explorer' }).getAttribute('href')).toContain(
      'explorer',
    );
    expect(screen.getByRole('textbox', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Star' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Move' })).toBeTruthy();
  });

  it('stars, saying Starred once starred', () => {
    const chrome = chromeOf({ star: { starred: true, onToggle: vi.fn() } });
    render(<Row chrome={chrome} />);
    const star = screen.getByRole('button', { name: 'Starred' });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(star);
    expect(chrome.star!.onToggle).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentStar');
  });

  it('opens the folder picker from Move and from File > Move', () => {
    const chrome = chromeOf();
    render(<Row chrome={chrome} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    openFile();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Move/ }));
    expect(chrome.move).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentMove');
  });

  it('puts the focus in the name from File > Rename', () => {
    render(<Row chrome={chromeOf()} />);
    openFile();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Rename/ }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Rename' }));
  });

  it('shows Share, with its lock while private, and opens the share dialog from it and the File menu', () => {
    const chrome = chromeOf();
    render(<Row chrome={chrome} />);
    const share = screen.getByRole('button', { name: 'Share' });
    expect(share.querySelector('svg')).toBeTruthy();
    fireEvent.click(share);
    openFile();
    fireEvent.click(
      within(screen.getByRole('menu')).getByRole('menuitem', { name: /Share with others/ }),
    );
    expect(chrome.share!.onOpen).toHaveBeenCalledTimes(2);
  });

  it("shows Make a copy in Share's place for one who may not share, and leaves their File menu without them", () => {
    const run = vi.fn();
    render(
      <Row
        chrome={chromeOf({
          rename: null,
          move: null,
          share: null,
          makeCopy: { copying: false, run },
        })}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    expect(run).toHaveBeenCalledOnce();
    // Nothing of File is theirs here, so File is not drawn.
    expect(
      within(screen.getByRole('menubar')).queryByRole('menuitem', { name: 'File' }),
    ).toBeNull();
  });

  it("opens LiveDoc's settings and the account", () => {
    const chrome = chromeOf();
    render(<Row chrome={chrome} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(chrome.onOpenSettings).toHaveBeenCalledOnce();
    expect(chrome.onOpenAccount).toHaveBeenCalledOnce();
  });

  it('shows four people, then a count opening the rest', () => {
    const people = ['Ada', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay'].map((n, i) => ({
      participant: person(`p${i}`, n),
      tabId: 't1',
    }));
    render(<Row chrome={chromeOf({ people })} />);
    const group = screen.getByRole('group', { name: 'People here' });
    expect(within(group).getByRole('button', { name: 'Ada' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Dee' })).toBeTruthy();
    expect(within(group).queryByRole('button', { name: 'Eve' })).toBeNull();
    fireEvent.click(within(group).getByRole('button', { name: '2 more people' }));
    expect(within(group).getByRole('button', { name: /Fay/ })).toBeTruthy();
  });

  it('follows a person here to their caret, and one elsewhere to their tab', () => {
    const onFollow = vi.fn(() => true);
    const chrome = chromeOf({
      people: [
        { participant: person('a', 'Ada'), tabId: 't1' },
        { participant: person('b', 'Ben'), tabId: 't2' },
      ],
    });
    render(<Row chrome={chrome} onFollow={onFollow} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ada' }));
    expect(onFollow).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Ben' }));
    expect(chrome.onOpenTab).toHaveBeenCalledWith('t2');
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentFollow');
  });

  it('draws the name as text and none of the document parts outside the editor page', () => {
    render(<Row chrome={null} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Minutes');
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Explorer' })).toBeNull();
  });
});

describe('OfficeTitleRow, the save status', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  const fixed = (status: OfficeSaveStatus) => ({ get: () => status, subscribe: () => () => {} });

  it('shows the status the kind reports, and none when it reports none', () => {
    const root = { current: null };
    const props = {
      name: 'Minutes',
      format: '.ODT',
      formatTitle: 'OpenDocument format',
      problem: null,
      catalogue: CATALOGUE,
      level: 'edit' as const,
      actions: {},
      shortcuts: TEXT_DOCUMENT_SHORTCUTS,
      keyScope: root,
    };
    const { rerender } = render(<OfficeTitleRow {...props} saveStatus={fixed('saving')} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
    rerender(<OfficeTitleRow {...props} saveStatus={null} />);
    expect(document.querySelector('[data-save-status]')).toBeNull();
  });

  it('follows its source where it is drawn, after the frame the change happens in', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const root = { current: null };
    let status: OfficeSaveStatus | null = 'saved';
    const listeners = new Set<() => void>();
    const source = {
      get: () => status,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    render(
      <OfficeTitleRow
        name="Minutes"
        format=".ODT"
        formatTitle="OpenDocument format"
        problem={null}
        catalogue={CATALOGUE}
        level="edit"
        actions={{}}
        shortcuts={TEXT_DOCUMENT_SHORTCUTS}
        keyScope={root}
        saveStatus={source}
      />,
    );
    expect(screen.getByRole('button', { name: 'All changes saved' })).toBeTruthy();
    act(() => {
      status = 'saving';
      for (const listener of listeners) listener();
      vi.advanceTimersToNextFrame();
    });
    expect(screen.getByRole('button', { name: 'All changes saved' })).toBeTruthy();
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
    act(() => {
      status = null;
      for (const listener of listeners) listener();
      vi.runAllTimers();
    });
    expect(document.querySelector('[data-save-status]')).toBeNull();
  });
});

// docs/specs/029-sheets/files-and-print.md "A file sent in parts": what is under way is said as a status.
describe('OfficeTitleRow, the notice', () => {
  it('says a notice as a status, and nothing without one', () => {
    const root = { current: null };
    const props = {
      name: 'Budget',
      format: '.XLSX',
      formatTitle: 'Excel format',
      problem: null,
      catalogue: CATALOGUE,
      level: 'view' as const,
      actions: {},
      shortcuts: TEXT_DOCUMENT_SHORTCUTS,
      keyScope: root,
    };
    const { rerender } = render(<OfficeTitleRow {...props} notice="Opening “Q3”… 40%" />);
    expect(screen.getByRole('status').textContent).toBe('Opening “Q3”… 40%');
    rerender(<OfficeTitleRow {...props} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
