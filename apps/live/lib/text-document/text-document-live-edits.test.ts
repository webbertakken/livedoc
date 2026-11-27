// docs/specs/034-text-documents/tools.md "Accessibility settings", Show live edits.
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  editTextOf,
  LIVE_EDIT_JOIN_MS,
  LIVE_EDIT_TEXT_MAX,
  LIVE_EDITS_MAX,
  LiveEdits,
  type LiveEdit,
} from './text-document-live-edits';

/** A writer's document and a reader kept in step; answers what the reader's deep events said of each change. */
function pair() {
  const writer = new Y.Doc();
  const reader = new Y.Doc();
  const text = new Y.XmlText();
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [text]);
  writer.getXmlFragment('body').insert(0, [paragraph]);
  Y.applyUpdate(reader, Y.encodeStateAsUpdate(writer));
  const seen: ReturnType<typeof editTextOf>[] = [];
  reader.getXmlFragment('body').observeDeep((events) => seen.push(editTextOf(events)));
  const change = (edit: (t: Y.XmlText) => void) => {
    const before = Y.encodeStateVector(reader);
    writer.transact(() => edit(text));
    Y.applyUpdate(reader, Y.encodeStateAsUpdate(writer, before));
  };
  return { change, seen };
}

describe('editTextOf', () => {
  it('reads what a change added and what it removed', () => {
    const { change, seen } = pair();
    change((t) => t.insert(0, 'the plan'));
    change((t) => {
      t.delete(0, 4);
      t.insert(4, '!');
    });
    expect(seen).toEqual([
      { added: 'the plan', removed: '' },
      { added: '!', removed: 'the ' },
    ]);
  });

  it('reads nothing from a change to formatting or to a paragraph’s attributes', () => {
    const { change, seen } = pair();
    change((t) => t.insert(0, 'ab'));
    change((t) => t.format(0, 1, { bold: true }));
    change((t) => (t.parent as Y.XmlElement).setAttribute('style', 'h1'));
    expect(seen.slice(1)).toEqual([
      { added: '', removed: '' },
      { added: '', removed: '' },
    ]);
  });
});

const ada = { from: 'p1', name: 'Ada' };

describe('LiveEdits.add', () => {
  it('joins an author’s changes within the join time, and starts anew after it or for another', () => {
    let entries: readonly LiveEdit[] = [];
    entries = LiveEdits.add(entries, { ...ada, added: 'he', removed: '' }, 0);
    entries = LiveEdits.add(entries, { ...ada, added: 'llo', removed: 'x' }, LIVE_EDIT_JOIN_MS);
    expect(entries).toEqual([{ ...ada, added: 'hello', removed: 'x', at: LIVE_EDIT_JOIN_MS }]);
    entries = LiveEdits.add(entries, { from: 'p2', name: 'Bo', added: 'b', removed: '' }, 2001);
    entries = LiveEdits.add(entries, { ...ada, added: 'z', removed: '' }, 2002);
    expect(entries.map((e) => e.added)).toEqual(['z', 'b', 'hello']);
    entries = LiveEdits.add(
      entries,
      { ...ada, added: 'later', removed: '' },
      2002 + LIVE_EDIT_JOIN_MS + 1,
    );
    expect(entries.map((e) => e.added)).toEqual(['later', 'z', 'b', 'hello']);
  });

  it('keeps nothing from a change that added and removed no text', () => {
    const entries = LiveEdits.add([], { ...ada, added: '', removed: '' }, 0);
    expect(entries).toEqual([]);
  });

  it('keeps the newest entries and the end of a long text', () => {
    let entries: readonly LiveEdit[] = [];
    for (let i = 0; i < LIVE_EDITS_MAX + 5; i += 1)
      entries = LiveEdits.add(entries, { from: `p${i}`, name: 'X', added: `${i}`, removed: '' }, i);
    expect(entries).toHaveLength(LIVE_EDITS_MAX);
    expect(entries[0]!.added).toBe(`${LIVE_EDITS_MAX + 4}`);
    const long = 'a'.repeat(LIVE_EDIT_TEXT_MAX) + 'END';
    const one = LiveEdits.add([], { ...ada, added: long, removed: long }, 0)[0]!;
    expect(one.added).toHaveLength(LIVE_EDIT_TEXT_MAX);
    expect(one.added.endsWith('END')).toBe(true);
    const joined = LiveEdits.add([one], { ...ada, added: 'Z', removed: '' }, 1)[0]!;
    expect(joined.added.endsWith('ENDZ')).toBe(true);
  });
});

describe('LiveEdits.say', () => {
  it('says who added and removed what, white space run together', () => {
    const entry = { ...ada, added: ' the  plan ', removed: 'a', at: 0 };
    expect(LiveEdits.say(entry)).toBe('Ada added “the plan”; removed “a”');
    expect(LiveEdits.say({ ...entry, added: '' })).toBe('Ada removed “a”');
    expect(LiveEdits.say({ ...entry, removed: '' })).toBe('Ada added “the plan”');
    expect(LiveEdits.say({ ...entry, added: ' ', removed: '\n' })).toBe('Ada changed spacing');
  });
});
