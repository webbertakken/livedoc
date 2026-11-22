import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { PdfLiveChanges } from './live-changes';
import { Mark } from './mark';
import { PageName } from './page-name';
import { PdfChange } from './pdf-change';

// docs/specs/035-pdf-documents/live-editing-and-storage.md "Concurrent changes": a test a row, for every row whose
// root holds changes today. Two people start from one state, each changes it without sight of the other, and each
// then hears the other: both must show the same, and what the row says.

const at = Date.UTC(2026, 10, 22);
const highlight = (id: string, page: PageName = PageName.ofObject(3)) =>
  Mark.highlight({
    id,
    page,
    quads: [[72, 720, 172, 720, 72, 700, 172, 700]],
    text: 'The quick',
    colour: '#fdf1a9',
    opacity: 1,
    author: 'Ada',
    createdAt: at,
  })!;
const filled = (field: string, value: string, by: string) => ({ field, value, by, at });

/** Two people on one state: `ada` made it, `grace` read it. */
function together(start: readonly PdfChange[] = []) {
  const ada = PdfLiveChanges.load();
  for (const change of start) expect(PdfChange.apply(ada, change)).toBeNull();
  const grace = PdfLiveChanges.load([PdfLiveChanges.encode(ada)]);
  return { ada, grace };
}

/** Each hears what the other made. */
function heard(ada: Y.Doc, grace: Y.Doc): void {
  const fromAda = PdfLiveChanges.encode(ada);
  const fromGrace = PdfLiveChanges.encode(grace);
  Y.applyUpdate(ada, fromGrace);
  Y.applyUpdate(grace, fromAda);
}

const shown = (doc: Y.Doc) => ({
  marks: PdfLiveChanges.marks(doc),
  fieldValues: PdfLiveChanges.fieldValues(doc),
  removed: [...PdfLiveChanges.removed(doc)],
  turns: [...PdfLiveChanges.pageTurns(doc)],
});

describe('two people changing one PDF at once', () => {
  it('keeps both marks where each adds one, on one page or two', () => {
    const { ada, grace } = together();
    PdfChange.apply(ada, PdfChange.addMark(highlight('a', PageName.ofObject(3))));
    PdfChange.apply(grace, PdfChange.addMark(highlight('b', PageName.ofObject(3))));
    PdfChange.apply(grace, PdfChange.addMark(highlight('c', PageName.ofObject(9))));
    heard(ada, grace);
    expect(PdfLiveChanges.marks(ada).map((mark) => mark.id)).toEqual(['a', 'b', 'c']);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('merges their changes to one mark property by property', () => {
    const { ada, grace } = together([PdfChange.addMark(highlight('m'))]);
    PdfChange.apply(ada, PdfChange.changeMark('m', { colour: '#bfe3ff' }));
    PdfChange.apply(grace, PdfChange.changeMark('m', { opacity: 0.5 }));
    heard(ada, grace);
    expect(PdfLiveChanges.marks(ada)).toEqual([
      { ...highlight('m'), colour: '#bfe3ff', opacity: 0.5 },
    ]);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('lets the later write to one property of a mark win', () => {
    const { ada, grace } = together([PdfChange.addMark(highlight('m'))]);
    PdfChange.apply(ada, PdfChange.changeMark('m', { colour: '#bfe3ff' }));
    Y.applyUpdate(grace, PdfLiveChanges.encode(ada));
    PdfChange.apply(grace, PdfChange.changeMark('m', { colour: '#ffd6e0' }));
    heard(ada, grace);
    expect(PdfLiveChanges.marks(ada)[0]!.colour).toBe('#ffd6e0');
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('gives one property written by both at once, unseen, one value for everyone', () => {
    const { ada, grace } = together([PdfChange.addMark(highlight('m'))]);
    PdfChange.apply(ada, PdfChange.changeMark('m', { colour: '#bfe3ff' }));
    PdfChange.apply(grace, PdfChange.changeMark('m', { colour: '#ffd6e0' }));
    heard(ada, grace);
    expect(['#bfe3ff', '#ffd6e0']).toContain(PdfLiveChanges.marks(ada)[0]!.colour);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('deletes a mark one person removes as another changes it', () => {
    const { ada, grace } = together([PdfChange.addMark(highlight('m'))]);
    PdfChange.apply(ada, PdfChange.changeMark('m', { colour: '#bfe3ff' }));
    PdfChange.apply(grace, PdfChange.removeMark('m'));
    heard(ada, grace);
    expect(PdfLiveChanges.marks(ada)).toEqual([]);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('keeps both values where they fill different fields', () => {
    const { ada, grace } = together();
    PdfChange.apply(ada, PdfChange.fill(filled('applicant.name', 'Ada', 'Ada')));
    PdfChange.apply(grace, PdfChange.fill(filled('applicant.city', 'Arlington', 'Grace')));
    heard(ada, grace);
    expect(PdfLiveChanges.fieldValues(ada).map((value) => [value.field, value.value])).toEqual([
      ['applicant.city', 'Arlington'],
      ['applicant.name', 'Ada'],
    ]);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('lets the later write to one field win, whole: its value and who set it', () => {
    const { ada, grace } = together();
    PdfChange.apply(ada, PdfChange.fill(filled('applicant.city', 'London', 'Ada')));
    Y.applyUpdate(grace, PdfLiveChanges.encode(ada));
    PdfChange.apply(grace, PdfChange.fill(filled('applicant.city', 'Arlington', 'Grace')));
    heard(ada, grace);
    expect(PdfLiveChanges.fieldValues(ada)).toEqual([
      filled('applicant.city', 'Arlington', 'Grace'),
    ]);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('gives one field filled by both at once, unseen, one person’s value whole for everyone', () => {
    const { ada, grace } = together();
    const fromAda = filled('applicant.city', 'London', 'Ada');
    const fromGrace = filled('applicant.city', 'Arlington', 'Grace');
    PdfChange.apply(ada, PdfChange.fill(fromAda));
    PdfChange.apply(grace, PdfChange.fill(fromGrace));
    heard(ada, grace);
    const [value, ...others] = PdfLiveChanges.fieldValues(ada);
    expect(others).toEqual([]);
    expect([fromAda, fromGrace]).toContainEqual(value);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('keeps a mark on its page while another person turns the page', () => {
    const page = PageName.ofObject(3);
    const { ada, grace } = together();
    PdfChange.apply(ada, PdfChange.addMark(highlight('m', page)));
    PdfChange.apply(grace, PdfChange.turnPage(page, 90));
    heard(ada, grace);
    expect(PdfLiveChanges.marks(ada)).toEqual([highlight('m', page)]);
    expect([...PdfLiveChanges.pageTurns(ada)]).toEqual([[page, 90]]);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('keeps both where one deletes a mark of the stored file as another marks its page', () => {
    const { ada, grace } = together();
    PdfChange.apply(ada, PdfChange.removeFromFile('o:41', 'mark'));
    PdfChange.apply(grace, PdfChange.addMark(highlight('m')));
    heard(ada, grace);
    expect([...PdfLiveChanges.removed(ada)]).toEqual([['o:41', 'mark']]);
    expect(PdfLiveChanges.marks(ada)).toEqual([highlight('m')]);
    expect(shown(grace)).toEqual(shown(ada));
  });

  it('shows the same whatever order the changes arrive in', async () => {
    const { ada, grace } = together([PdfChange.addMark(highlight('m'))]);
    const updates: Uint8Array[] = [];
    ada.on('update', (update: Uint8Array) => updates.push(update));
    grace.on('update', (update: Uint8Array) => updates.push(update));
    const start = PdfLiveChanges.encode(ada);
    PdfChange.apply(ada, PdfChange.changeMark('m', { colour: '#bfe3ff' }));
    PdfChange.apply(grace, PdfChange.fill(filled('applicant.city', 'Arlington', 'Grace')));
    PdfChange.apply(ada, PdfChange.addMark(highlight('n')));
    PdfChange.apply(grace, PdfChange.turnPage(PageName.ofObject(3), 180));
    const inOrder = PdfLiveChanges.load([start, ...updates]);
    const reversed = PdfLiveChanges.load([start, ...[...updates].reverse()]);
    expect(shown(reversed)).toEqual(shown(inOrder));
    expect(await PdfLiveChanges.fingerprint(reversed)).toBe(
      await PdfLiveChanges.fingerprint(inOrder),
    );
  });

  // The rows whose roots hold nothing yet: each joins with the change that fills its root.
  it.todo('keeps every character where both type in one Text mark');
  it.todo('keeps both replies in one thread, in time order');
  it.todo('keeps a mark on its page wherever another person moves the page');
  it.todo(
    'keeps a mark and its thread with a page another person deletes, to return if the delete is undone',
  );
  it.todo('lands each of two moves of pages, the later of two moves of one page winning');
  it.todo('keeps both edits to different objects of one page');
  it.todo('merges two edits to one picture or shape property by property');
  it.todo('keeps a text box the first person’s while they type');
});
