import type { Metadata } from 'next';
import { NoticeLinkSettings } from '@/components/notifications/NoticeLinkSettings';

// /notification-settings?token=<token>: where a text document email's settings link lands
// (docs/specs/034-text-documents/review.md "Notifications"). Outside the Explorer chrome, so it works signed out. The
// token is read client-side, so this stays a thin shell; `index: false` is inherited from the root layout.
export const metadata: Metadata = {
  title: 'Notification settings | LiveDoc',
};

export default function NotificationSettingsPage() {
  return <NoticeLinkSettings />;
}
