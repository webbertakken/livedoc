import { beforeEach, describe, expect, it } from 'vitest';
import {
  askViewFor,
  closeAsk,
  openAsk,
  resetAskViewForTests,
  setAskFailure,
  setAsking,
  type AskAnchor,
} from './ask-view';

const anchor: AskAnchor = {
  getBoundingClientRect: () => new DOMRect(0, 0, 10, 10),
  focus: () => {},
  contains: () => false,
};

describe('the ask popover as a person has it', () => {
  beforeEach(resetAskViewForTests);

  it('is closed, about the board, until it is opened about something', () => {
    expect(askViewFor('es')).toMatchObject({
      open: false,
      scope: { type: 'board' },
      asking: false,
    });
    openAsk('es', { type: 'context', id: 'ordering' }, anchor);
    expect(askViewFor('es')).toMatchObject({
      open: true,
      scope: { type: 'context', id: 'ordering' },
      anchor,
    });
  });

  it('is closed on every other board', () => {
    openAsk('es', { type: 'board' }, anchor);
    expect(askViewFor('other').open).toBe(false);
  });

  it('closes without ending an ask under way', () => {
    openAsk('es', { type: 'board' }, anchor);
    setAsking('es', true);
    closeAsk('es');
    expect(askViewFor('es')).toMatchObject({ open: false, asking: true, anchor: null });
    closeAsk('es');
    expect(askViewFor('es').open).toBe(false);
  });

  it('says why an ask failed until the next one starts or the popover opens again', () => {
    openAsk('es', { type: 'board' }, anchor);
    setAsking('es', true);
    setAskFailure('es', 'The model did not answer.');
    expect(askViewFor('es')).toMatchObject({ asking: false, failure: 'The model did not answer.' });
    setAsking('es', true);
    expect(askViewFor('es').failure).toBeNull();
    setAskFailure('es', 'Again.');
    openAsk('es', { type: 'board' }, anchor);
    expect(askViewFor('es').failure).toBeNull();
    setAsking('es', false);
    expect(askViewFor('es').asking).toBe(false);
  });
});
