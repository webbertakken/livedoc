import { describe, expect, it, vi } from 'vitest';
import { textDocumentSaveStatus, textDocumentSaveStatusSource } from './text-document-save-status';

// docs/specs/034-text-documents/editing-surface.md "The title row": the save status table.
describe('textDocumentSaveStatus', () => {
  const room = { local: false, connected: true, pending: false, failed: false };

  it('is Saved when the room holds every edit, Saving while one is unconfirmed', () => {
    expect(textDocumentSaveStatus(room)).toBe('saved');
    expect(textDocumentSaveStatus({ ...room, pending: true })).toBe('saving');
  });

  it('is Offline while the room is not open, whatever is pending', () => {
    expect(textDocumentSaveStatus({ ...room, connected: false })).toBe('offline');
    expect(textDocumentSaveStatus({ ...room, connected: false, pending: true })).toBe('offline');
  });

  it('lets Failed win over every other status', () => {
    expect(textDocumentSaveStatus({ ...room, failed: true, pending: true })).toBe('failed');
    expect(textDocumentSaveStatus({ ...room, failed: true, connected: false })).toBe('failed');
    expect(textDocumentSaveStatus({ ...room, local: true, failed: true })).toBe('failed');
  });

  it('is Saved in This Browser for a text document there, Saving while a write is due', () => {
    expect(textDocumentSaveStatus({ ...room, local: true, connected: false })).toBe('this-browser');
    expect(textDocumentSaveStatus({ ...room, local: true, pending: true })).toBe('saving');
  });
});

// docs/specs/034-text-documents/editing-surface.md "The title row": the status, read where it is drawn
// (performance.md "Budgets": a keystroke never draws the surface again for it).
describe('textDocumentSaveStatusSource', () => {
  function signal<T>(initial: T) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => value,
      set: (next: T) => {
        value = next;
        for (const listener of listeners) listener();
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }

  it('reads the status from the facts, where the document lives and the connection', () => {
    const facts = signal({ pending: false, failed: false });
    const connection = signal(true);
    const source = textDocumentSaveStatusSource(facts, false, connection, () => {});
    expect(source.get()).toBe('saved');
    facts.set({ pending: true, failed: false });
    expect(source.get()).toBe('saving');
    connection.set(false);
    expect(source.get()).toBe('offline');
    expect(textDocumentSaveStatusSource(facts, true, connection, () => {}).get()).toBe('saving');
  });

  it('tells its watcher of the facts and the connection changing, and stops when let go', () => {
    const facts = signal({ pending: false, failed: false });
    const connection = signal(true);
    const source = textDocumentSaveStatusSource(facts, false, connection, () => {});
    const listener = vi.fn();
    const stop = source.subscribe(listener);
    facts.set({ pending: true, failed: false });
    connection.set(false);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    facts.set({ pending: false, failed: false });
    connection.set(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('logs each status it changes to, once', () => {
    const facts = signal({ pending: false, failed: false });
    const connection = signal(true);
    const log = vi.fn();
    const source = textDocumentSaveStatusSource(facts, false, connection, log);
    source.subscribe(() => {});
    facts.set({ pending: true, failed: false });
    facts.set({ pending: true, failed: false });
    facts.set({ pending: false, failed: false });
    expect(log.mock.calls).toEqual([
      ['[text-document] save-status', { status: 'saving' }],
      ['[text-document] save-status', { status: 'saved' }],
    ]);
  });
});
