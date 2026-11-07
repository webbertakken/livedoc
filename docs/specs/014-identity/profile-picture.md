# Profile picture

**Status: shipped.** A signed-in person's avatar shows their profile picture: the Google picture their account was
created with. They see it in their own chrome, and signed-in collaborators see it on presence avatars, cursors,
comments and team member lists, unless they turn it off. Anonymous share-link visitors always see initials. Without a
picture, or when it cannot be shown, the avatar is the initial on its disc, exactly as before. Builds on
[Auth + guest access](auth-and-guest-access.md) (sign-in is optional) and the identity card of
[Account settings & email notifications](profile-and-email-notifications.md).

## 1. Where the picture comes from

Google is the only source. An account created by "Continue with Google" takes Google's `picture` claim as its
**image** (better-auth's `user.image`), a URL on Google's picture host, `lh3.googleusercontent.com`. LiveDoc stores
that URL with the account in its own D1 ([Auth + guest access → Privacy](auth-and-guest-access.md#privacy)), never the
image, and never proxies it: the browser reads the URL off its own session and loads the image straight from Google's
host. Only the URL travels to collaborators (§6).

- **An email-code account has no picture.** Its avatar is the initial.
- **Linking Google later adds no picture.** Connecting Google to an account that began with an email code keeps the
  account's name and picture as they were (better-auth's `updateUserInfoOnLink` stays off), so the avatar stays the
  initial.
- **Uploads are not offered.** There is no picture upload in LiveDoc (§12).

## 2. Which picture wins

There is one candidate, so the **profile picture URL** is:

1. **The account's image**, when it is an `https:` URL on `lh3.googleusercontent.com` (`PROFILE_PICTURE_HOST`), at
   most 512 characters, with no port and no credentials.
2. **None** otherwise: the initials avatar. A URL on any other host counts as no picture, so nothing but Google's
   picture host is ever requested.

The picture is fetched straight from Google, sized by Google's own option: the path's options after its last `=` are
replaced with `s<px>-c` (square, centred), so a URL stored at one size draws crisp at any. Each disc offers a 96px and a
192px source (`srcset` with `sizes` set to the disc's size), so the profile card's 72px disc is crisp at 2x, a 44px disc at 2x and 3x, and the smaller discs
reuse the 96px download.

## 3. What "automatically" means

- **First Google sign-in**: the account is created with Google's picture, which shows on the first page after sign-in,
  to you and to the people you collaborate with. No action.
- **Google picture changed**: it does not reach LiveDoc. better-auth keeps the profile an account was created with and
  does not overwrite it on a later Google sign-in (`overrideUserInfoOnSignIn` stays off), so the account keeps its
  first picture.
- **No polling.** The picture is read from the session read the page makes anyway, and the image comes from Google's
  host.

## 4. The switch: "Show my profile picture"

A toggle in **Settings > Account > You**, signed-in only, stored as
`showProfilePicture` in the synced preferences blob
([User preferences](../007-editor/user-preferences.md)), so it follows the
account across devices. Its default is one named constant,
`SHOW_PROFILE_PICTURE_DEFAULT`, set to **on**.

- **On**: collaborators who are signed in see your picture (§5).
- **Off**: everyone else sees your initials, everywhere, including rooms that
  are already open: the toggle sends the room an identity update at once.
- **Your own chrome always shows your picture to you**, whatever the switch
  says: it is your screen.

## 5. Where it shows, and to whom

| Surface                                                                                                  | You (own chrome) | Signed-in collaborators | Anonymous share-link visitors |
| -------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------- | ----------------------------- |
| Header account button, Settings > Account card                                                           | always           | n/a                     | n/a                           |
| Presence avatars (the document group, the tab list, Collaborators, and every roster built from presence) | always           | when your switch is on  | initials                      |
| Live cursor labels                                                                                       | n/a              | when your switch is on  | initials                      |
| Comment authors (thread popover, on-canvas bubbles)                                                      | always           | when your switch is on  | initials                      |
| Team member lists                                                                                        | always           | when your switch is on  | n/a (teams are signed-in)     |

**Signed-in collaborator** means a viewer whose own session is a verified
account: a teammate, or a signed-in person who opened a share link.
**Anonymous share-link visitor** means anyone not signed in: they always see
initials, and the server never sends them a picture URL. There is no second
switch for them.

## 6. How the picture travels

The picture is a URL, never bytes: nothing is proxied, and nothing is stored
in R2. Two server-side places hold it, both set only by the person's own
verified session and both cleared when the switch is off:

- **The participant record** (`participants.picture_url`, D1 migration
  `0058`). `PUT /api/participants/<id>/picture` sets or clears it; the caller
  must be that id's own session token (a guest header or an API token is
  refused). `GET /api/participants/<id>` returns `pictureUrl` only to a
  signed-in caller, and team member lists carry it for joined members.
- **Comment authors** are looked up by the server, because a reader never
  holds other people's comment author ids (they are owner ids, a guest's
  credential, redacted on every read).
  `GET /api/documents/<id>/tabs/<tabId>/comment-pictures` answers a reader
  with read access with comment id to picture URL, and an anonymous reader
  with an empty map. Your own comments show your own picture to you.
- **The realtime room's presence.** A signed-in client's room join mints a
  one-time room ticket over authenticated REST, which records that the
  session is a verified account (`ws_tickets.account`, same migration). The
  room keeps a `picture` from a `hello` only for such a session, and sends it
  only to recipients who are themselves account sessions; everyone else gets
  the same roster without it. Turning the switch off or on sends an
  `identity` frame over the open socket, which updates the roster in place
  without re-joining.

Trust: the room and the participant record accept only `https` URLs on
`lh3.googleusercontent.com`, at most 512 characters, from a verified account. They cannot
check that the URL is that account's own picture (the account's image is not
consulted on a PUT), exactly as the presence name is the person's own claim today. A
signed-in user could present somebody else's Google picture URL; they could
already present somebody else's name.

## 7. States and fallbacks

| State                                                                                     | Avatar                                                               |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Sign-in off for the deployment (a guest-only host)                                        | Initials everywhere, exactly as before; no image request is made.    |
| Guest                                                                                     | Initials; a guest has no picture and never sees anybody else's.      |
| Signed in, no picture resolved                                                            | Initial on the disc, exactly as before.                              |
| Picture loading                                                                           | Initial on the disc; the picture has not painted yet.                |
| Picture loaded                                                                            | The picture, cropped to the disc.                                    |
| Picture failed to load                                                                    | Initial on the disc, for the rest of that URL's life on the page.    |
| Picture URL changes                                                                       | Starts again from "loading"; a previous failure does not carry over. |
| A comment whose author id is not known yet (it arrived live and the author has not saved) | Initial, until the next load.                                        |

**No layout shift.** Every disc has the same fixed size in every state
([Layout stability](../004-interface-design/layout-stability.md)): the
initial is always rendered, and the picture is an overlay with explicit
`width` and `height` inside the same box, shown only once it has loaded. A
presence ring stays around the disc, over the picture's edge.

### Initials

Without a picture a disc shows the person's (or team's) **initials**: the first letter of the name's first and last
words, or the first two letters of a one-word name, in capitals, and `?` for a blank name. A letter is a character as a
reader sees it (a grapheme), so a name that starts or ends with an emoji, a flag, an emoji with a skin tone or an
accented letter keeps it whole ("🚀 Launch" reads "🚀L"), never half of one as a replacement character. One helper,
`initialsOf` in `@livedoc/document`, draws them everywhere: presence avatars, cursor labels, comment authors, team
discs, the Share dialog's identity and the headless export.

The identity row's note reads "Your name, email and picture come from your
account. Signed out, your documents belong to this browser." The help article Signing In
(`apps/help/app/account-and-data/signing-in/`) and the privacy policy
(`apps/help/app/policies/privacy-policy/`) say who sees the picture, where it
comes from and how to turn it off.

## 8. Accessibility

Pictures are decorative (`alt=""`): every surface already names the person
beside or on the disc (the account button's first name, the card's full
name, a presence avatar's `aria-label`, a comment's author line, a cursor's
name pill, a member row's name). A picture carries no text to contrast; the
initials underneath keep their existing contrast.

## 9. Privacy and security

- Shown only to people you collaborate with who are signed in; people who
  open your share links without signing in see your initials.
- `https:` on `lh3.googleusercontent.com` only. Every image is requested with
  `referrerpolicy="no-referrer"`, so Google's host never learns which
  document is open.
- The live app's `Content-Security-Policy` carries Trusted Types only, with no
  `img-src` ([Trusted Types](../016-platform/trusted-types.md)). An `img-src`
  added later must allow `https://lh3.googleusercontent.com`.
- Deleting the account deletes the participant record, and with it the URL.
- Sign-in off: nothing is published and nothing is requested.

## 10. Performance

One request per distinct person per page for a 96px crop (a few kilobytes)
from Google's picture host, after auth has settled. The picture adds at most 512 bytes
to a presence entry and one D1 column read to the member-list and participant
reads that already happen. Comment pictures are one
`comment-pictures` request per tab per page (again only when a comment the
page has not seen appears), made only for signed-in readers, reading at most
50 distinct authors' records. Images decode off the main thread (`decoding="async"`).

## 11. Observability and telemetry

- A picture that fails to load logs `[profile-picture] load failed` with the
  image host (never the full URL).
- The api logs `[profile-picture] rejected` with a reason (`not_account`,
  `invalid_url`) when a picture PUT or a hello picture is refused.
- Flipping the switch emits `UI` / `Toggled` /
  `ShowProfilePictureOn` / `ShowProfilePictureOff` before persisting, like
  every Settings toggle ([Telemetry](../017-telemetry/telemetry.md)).

## 12. Out of scope

- Uploading or changing the picture inside LiveDoc; the picture is the one
  Google gave at sign-up.
- Refreshing a Google picture after the account is created (§3): no Google
  token is kept ([Auth + guest access → Privacy](auth-and-guest-access.md#privacy)),
  and a later Google sign-in does not overwrite the account's profile.
- Verifying server-side that a picture URL is the account's own (§6).
- Pictures on the activity feed and exported files.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D1** How the Clerk URL's source is read: The first path segment as base64url JSON; any failure is `'unknown'`, never
  an upload (retired: the picture is the account's `image`, one URL with no source to read) (default).
- **D2** When the published picture is written: On change only, compared with the last value written on this page
  (default).
- **D3** A PUT before the participant row exists: 404 is accepted; the next change or page load writes it (default).
- **D4** How an open socket updates its identity: A distinct `identity` frame, so a hello keeps meaning "join" and its
  side effects never re-run (default).
- **D5** How a cursor shows a picture: A 14px disc leading the name pill, only when a picture exists (default).
- **D6** Several Google accounts linked: The first in Clerk's `externalAccounts` order (retired: the picture is the one
  Google gave when it created the account) (default).
- **D7** Whether a picture fades in: No transition: a small swap reads as a flicker when faded (default).
- **D8** How a hook reads module-level picture state: Through the `useSyncExternalStore` snapshot, never beside it: the
  React Compiler memoizes module reads (default).
- **D9** How many comment authors one request reads: 50 (`MAX_COMMENT_PICTURE_AUTHORS`); later authors show initials
  (default).
