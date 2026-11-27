'use client';

// Where a text document email's "Notification settings" link lands (docs/specs/034-text-documents/review.md
// "Notifications", In every email): `/notification-settings?token=<token>`, outside the Explorer chrome, signed in or
// not. Opening the page only reads the setting, so a mail client's link scanner changes nothing; each click on a choice
// keeps it at once, for this person and this document alone.
import { useEffect, useState } from 'react';
import type { NoticeLinkDto, NoticeSettingDto } from '@livedoc/api-schema';
import {
  Body,
  Eyebrow,
  Heading,
  LandingCard as Card,
  PrimaryLink,
  SecondaryLink,
} from '@/components/chrome/LandingCard';
import { useUrlToken } from '@/hooks/ui/useUrlToken';
import { apiReadNoticeLink, apiWriteNoticeLink } from '@/lib/api/notification-settings';
import { noticeSettingType } from '@livedoc/api-schema';
import { track } from '@/lib/telemetry';
import { NoticeSettingChoices } from './NoticeSettingChoices';

export const NOTICE_LINK_SAVE_FAILED = 'That didn’t save. Try again.';

type Lookup = 'loading' | 'invalid' | NoticeLinkDto;
type Saving = 'idle' | 'saving' | 'saved' | 'failed';

export function NoticeLinkSettings() {
  const token = useUrlToken();
  const [lookup, setLookup] = useState<Lookup>('loading');
  const [saving, setSaving] = useState<Saving>('idle');
  const resolved: Lookup = token === null || token === '' ? 'invalid' : lookup;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiReadNoticeLink(token).then(
      (res) => {
        if (!cancelled) setLookup(res ?? 'invalid');
      },
      () => {
        if (!cancelled) setLookup('invalid');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (resolved === 'loading') {
    return (
      <Card>
        <Body>Loading your notification settings…</Body>
      </Card>
    );
  }

  if (resolved === 'invalid') {
    return (
      <Card>
        <Heading>This Link Isn’t Valid</Heading>
        <Body>
          The document may have been deleted. You can still turn off every text document email in
          Settings.
        </Body>
        <PrimaryLink href="/explorer?settings=notifications">Open Settings</PrimaryLink>
      </Card>
    );
  }

  const keep = (setting: NoticeSettingDto) => {
    if (!token) return;
    // Counted before it is kept, as every settings flip is: the two choices, never who or which document.
    track('Document', 'Changed', `TextDocumentNotices${noticeSettingType(setting)}`);
    setLookup({ ...resolved, setting });
    setSaving('saving');
    apiWriteNoticeLink(token, setting).then(
      (res) => {
        if (!res) return setLookup('invalid');
        setLookup(res);
        setSaving('saved');
      },
      () => {
        setLookup(resolved);
        setSaving('failed');
      },
    );
  };

  return (
    <Card>
      <Eyebrow>{resolved.documentName || 'A text document'}</Eyebrow>
      <Heading>Notification Settings</Heading>
      <Body>What this document emails you about. A choice is saved as you make it.</Body>
      <div className="mt-4 flex flex-col gap-6">
        <NoticeSettingChoices
          setting={resolved.setting}
          disabled={saving === 'saving'}
          onChange={keep}
        />
      </div>
      <p
        role={saving === 'failed' ? 'alert' : 'status'}
        className={
          saving === 'failed'
            ? 'mt-3 text-body text-rose-600 dark:text-rose-400'
            : 'mt-3 text-body text-slate-600 dark:text-slate-400'
        }
      >
        {saving === 'saved' ? 'Saved' : saving === 'failed' ? NOTICE_LINK_SAVE_FAILED : ''}
      </p>
      <SecondaryLink href="/explorer?settings=notifications">
        Turn off all text document emails
      </SecondaryLink>
    </Card>
  );
}
