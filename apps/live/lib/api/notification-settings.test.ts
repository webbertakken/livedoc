import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiReadNoticeLink,
  apiReadNoticeSetting,
  apiWriteNoticeLink,
  apiWriteNoticeSetting,
} from './notification-settings';

// docs/specs/034-text-documents/review.md "Notifications" (The setting).

function stub(response: () => Promise<Response>) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(response);
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

const where = { ownerId: 'me', documentId: 'D 1', shareCode: 'CODE' };
const sent = (fetch: ReturnType<typeof stub>) => {
  const [url, init] = fetch.mock.calls[0]!;
  return {
    path: new URL(String(url), 'https://x.test').pathname,
    method: init?.method,
    share: new Headers(init?.headers).get('X-Share-Code'),
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  };
};

describe('the notification settings door', () => {
  it('reads the person’s setting for the document', async () => {
    const fetch = stub(async () => Response.json({ comments: 'all', edits: 'none' }));
    expect(await apiReadNoticeSetting(where)).toEqual({ comments: 'all', edits: 'none' });
    expect(sent(fetch)).toEqual({
      path: '/api/documents/D%201/notification-settings',
      method: 'GET',
      share: 'CODE',
      body: undefined,
    });
  });

  it('keeps a setting', async () => {
    const setting = { comments: 'none', edits: 'added-or-removed' } as const;
    const fetch = stub(async () => Response.json(setting));
    expect(await apiWriteNoticeSetting(where, setting)).toEqual(setting);
    expect(sent(fetch)).toEqual({
      path: '/api/documents/D%201/notification-settings',
      method: 'PUT',
      share: 'CODE',
      body: setting,
    });
  });

  it('throws when the door refuses', async () => {
    stub(async () => Response.json({ error: 'email_off' }, { status: 404 }));
    await expect(apiReadNoticeSetting(where)).rejects.toThrow();
  });
});

describe('an email’s signed settings link', () => {
  const answer = { documentName: 'Plan', setting: { comments: 'all', edits: 'none' } } as const;

  it('reads through the token alone', async () => {
    const fetch = stub(async () => Response.json(answer));
    expect(await apiReadNoticeLink('a.b')).toEqual(answer);
    expect(sent(fetch)).toEqual({
      path: '/api/notification-links/a.b',
      method: undefined,
      share: null,
      body: undefined,
    });
  });

  it('keeps a setting through it, and answers null for a link that names nothing', async () => {
    const fetch = stub(async () => Response.json(answer));
    expect(await apiWriteNoticeLink('a.b', answer.setting)).toEqual(answer);
    expect(sent(fetch)).toMatchObject({ method: 'PUT', body: answer.setting });
    stub(async () => Response.json({ error: 'link_not_found' }, { status: 404 }));
    expect(await apiReadNoticeLink('x')).toBeNull();
  });
});
