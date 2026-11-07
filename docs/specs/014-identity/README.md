# Identity

Follow the references below only as needed; never upfront.

- ./auth-and-guest-access.md - when working on Auth + guest access: sign-in with better-auth in LiveDoc's own api worker and D1 (Google, email codes), sessions, how the api knows the caller, the guest-to-account upgrade, account linking and deletion, privacy, self-hosting with no keys; the canvas always works without signing in
- ./sign-in-encouragement.md - when working on Sign-in encouragement: where a guest is invited to sign in, in place and never by a banner
- ./transactional-email.md - when working on Transactional & lifecycle email: Cloudflare Email Service, else Resend, else a preview outbox; off with none: sign-in codes, welcome + week-1 (Explorer) + week-2 (Teams) onboarding series off the daily cron, plus transactional team-invite and account-deleted emails. Off (no sends) when the key is unset
- ./profile-and-email-notifications.md - when working on Account settings & email notifications: Signed-in account home in the Explorer (avatar, name, email, join date); delete-account moves here; two opt-out email notifications (someone joins my document, someone responds to my team invite), gated like [Transactional & lifecycle email (Resend)](transactional-email.md)
- ./profile-picture.md - when working on Profile picture: uploaded or Google picture as the avatar, shown to signed-in collaborators behind a switch, initials as fallback
