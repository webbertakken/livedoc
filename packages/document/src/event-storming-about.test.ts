// docs/specs/021-event-storming/asks.md "About This Domain".
import { describe, expect, it } from 'vitest';
import { ABOUT_MAX, aboutOf, withAbout } from './event-storming-about';

type Board = { name?: string; esAbout?: string };

describe('aboutOf', () => {
  it('reads the trimmed text', () => {
    expect(aboutOf({ esAbout: '  We run a restaurant.\nGuests order at the table.  ' })).toBe(
      'We run a restaurant.\nGuests order at the table.',
    );
  });

  it('reads a board with none, a blank one or one that is no text as none', () => {
    expect(aboutOf({})).toBe('');
    expect(aboutOf({ esAbout: '   \n ' })).toBe('');
    expect(aboutOf({ esAbout: 7 })).toBe('');
  });

  it('cuts a text past the limit', () => {
    expect(aboutOf({ esAbout: 'a'.repeat(ABOUT_MAX + 50) })).toHaveLength(ABOUT_MAX);
  });
});

describe('withAbout', () => {
  it('keeps the trimmed text, cut to the limit', () => {
    expect(withAbout<Board>({ name: 'Board' }, '  A bakery.  ')).toEqual({
      name: 'Board',
      esAbout: 'A bakery.',
    });
    expect(withAbout<Board>({}, 'b'.repeat(ABOUT_MAX + 1)).esAbout).toHaveLength(ABOUT_MAX);
  });

  it('removes the field when the text is blank', () => {
    expect(withAbout<Board>({ name: 'Board', esAbout: 'A bakery.' }, '  ')).toEqual({
      name: 'Board',
    });
  });

  it('answers the same tab when nothing changes', () => {
    const tab = { esAbout: 'A bakery.' };
    expect(withAbout(tab, ' A bakery. ')).toBe(tab);
    const none: Board = { name: 'Board' };
    expect(withAbout(none, '')).toBe(none);
  });
});
