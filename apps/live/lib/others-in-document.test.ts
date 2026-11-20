import { describe, expect, it } from 'vitest';
import type { Participant } from '@/lib/identity';
import { othersInDocument } from './others-in-document';

const p = (id: string) => ({ id, name: id, color: '#000', status: 'online' }) as Participant;

// docs/specs/034-text-documents/editing-surface.md "The title row": presence is everyone else in the document.
describe('othersInDocument', () => {
  it('lists everyone but me once, on the first tab they are listed on, in tab order', () => {
    const byTab = new Map([
      ['t1', [p('me'), p('ada')]],
      ['t2', [p('ben'), p('ada')]],
    ]);
    expect(othersInDocument(byTab, 'me').map((o) => [o.participant.id, o.tabId])).toEqual([
      ['ada', 't1'],
      ['ben', 't2'],
    ]);
  });

  it('is empty when I am alone', () => {
    expect(othersInDocument(new Map([['t1', [p('me')]]]), 'me')).toEqual([]);
  });
});
