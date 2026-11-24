import { describe, expect, it } from 'vitest';
import { gateClientOp, type GateSender } from './room-op-gate';

// docs/specs/013-workspace/share-roles.md "The level ladder": what each role may relay through the room.
const as = (role: unknown, over: Partial<GateSender> = {}): GateSender => ({
  role,
  tabScope: null,
  key: 'me',
  ...over,
});
const relay = (presence: boolean, participantAnswers = false) => ({
  kind: 'relay',
  presence,
  participantAnswers,
});
const DROP = { kind: 'drop' };
const say = { kind: 'avatar-say', tabId: 't', id: 'a', text: 'hi', x: 0, y: 0 };

describe('gateClientOp', () => {
  it('never relays a system op from a client, whatever the role', () => {
    expect(gateClientOp({ kind: 'share-revoked', code: 'x' }, as('edit'))).toEqual(DROP);
  });

  it('relays presence from anyone, mutations from an editor only', () => {
    expect(gateClientOp({ kind: 'cursor' }, as('view'))).toEqual(relay(true));
    expect(gateClientOp({ kind: 'tab', tabId: 't', tab: { id: 't' } }, as('edit'))).toEqual(
      relay(false),
    );
    expect(gateClientOp({ kind: 'tab', tabId: 't', tab: { id: 't' } }, as('view'))).toEqual(DROP);
    // An unknown role reads as the lowest level.
    expect(gateClientOp({ kind: 'tab', tabId: 't', tab: { id: 't' } }, as('admin'))).toEqual(DROP);
  });

  it('keeps a viewer from taking part: answers, reactions, speech and focus', () => {
    for (const op of [{ kind: 'poll-answer' }, { kind: 'reaction' }, say, { kind: 'focus-here' }])
      expect(gateClientOp(op, as('view'))).toEqual(DROP);
    expect(gateClientOp({ kind: 'reaction' }, as('participate'))).toEqual(relay(true));
    expect(gateClientOp(say, as('participate'))).toEqual(relay(true));
    expect(gateClientOp({ kind: 'focus-here' }, as('participate'))).toEqual(DROP);
  });

  it('drops a malformed speech bubble from anyone', () => {
    expect(gateClientOp({ ...say, text: '' }, as('edit'))).toEqual(DROP);
  });

  it("routes a participant's element op through the content rule, and relays its own answers", () => {
    expect(gateClientOp({ kind: 'el', tabId: 't' }, as('participate'))).toEqual({
      kind: 'participant-content',
    });
    expect(gateClientOp({ kind: 'vote', voter: 'me' }, as('participate'))).toEqual(
      relay(false, true),
    );
    expect(gateClientOp({ kind: 'vote', voter: 'you' }, as('participate'))).toEqual(DROP);
    expect(gateClientOp({ kind: 'tab', tabId: 't', tab: { id: 't' } }, as('participate'))).toEqual(
      DROP,
    );
  });

  it("shows only an editor's drag preview", () => {
    expect(gateClientOp({ kind: 'drag-preview' }, as('edit'))).toEqual(relay(true));
    expect(gateClientOp({ kind: 'drag-preview' }, as('participate'))).toEqual(DROP);
  });

  it('keeps a tab-scoped session to its own tab', () => {
    const scoped = as('edit', { tabScope: 't1' });
    expect(gateClientOp({ kind: 'tab', tabId: 't1', tab: { id: 't1' } }, scoped)).toEqual(
      relay(false),
    );
    expect(gateClientOp({ kind: 'tab', tabId: 't2' }, scoped)).toEqual(DROP);
    expect(gateClientOp({ kind: 'document-meta' }, scoped)).toEqual(DROP);
  });

  // "Drawing tabs": and to the drawing tabs that belong to it, as the room's store says.
  it("lets a tab-scoped session act on its tab's drawing tabs, never another tab's", () => {
    const drawingOf = (id: string) => (id === 'd1' ? 't1' : id === 'd2' ? 't2' : null);
    const scoped = as('edit', { tabScope: 't1', drawingOf });
    expect(gateClientOp({ kind: 'tab', tabId: 'd1', tab: { id: 'd1' } }, scoped)).toEqual(
      relay(false),
    );
    expect(gateClientOp({ kind: 'tab', tabId: 'd2', tab: { id: 'd2' } }, scoped)).toEqual(DROP);
  });
});

// docs/specs/013-workspace/tab-scoped-share-links.md "Realtime": a tab op's payload keeps to the tab it names.
describe('gateClientOp: a tab op keeps to its tab', () => {
  it('drops a whole-tab op whose payload names another tab, or none, from anyone', () => {
    expect(gateClientOp({ kind: 'tab', tabId: 't1', tab: { id: 't2' } }, as('edit'))).toEqual(DROP);
    expect(gateClientOp({ kind: 'tab', tabId: 't1', tab: null }, as('edit'))).toEqual(DROP);
    expect(gateClientOp({ kind: 'tab', tabId: 't1', tab: { id: 't1' } }, as('edit'))).toEqual(
      relay(false),
    );
  });

  it('drops a tab-meta patch carrying the id, elements or articles, from anyone', () => {
    for (const key of ['id', 'elements', 'articles'])
      expect(
        gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: { [key]: 'x' } }, as('edit')),
        key,
      ).toEqual(DROP);
    expect(gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: null }, as('edit'))).toEqual(DROP);
    expect(
      gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: { theme: 'mono' } }, as('edit')),
    ).toEqual(relay(false));
  });

  // "Structure": a tab's name is structure, so a scoped session never renames its tab.
  it("drops a scoped session's rename of its own tab, and lets an unscoped one through", () => {
    const scoped = as('edit', { tabScope: 't1' });
    expect(
      gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: { name: 'Mine' } }, scoped),
    ).toEqual(DROP);
    expect(
      gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: {}, clear: ['name'] }, scoped),
    ).toEqual(DROP);
    expect(
      gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: { theme: 'mono' } }, scoped),
    ).toEqual(relay(false));
    expect(
      gateClientOp({ kind: 'tab-meta', tabId: 't1', patch: { name: 'Ours' } }, as('edit')),
    ).toEqual(relay(false));
  });
});
