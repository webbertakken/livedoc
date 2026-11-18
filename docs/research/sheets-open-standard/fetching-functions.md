# Functions that fetch or call a service (S4, C3)

Follow the references below only as needed; never upfront.

Researched 2026-11-18.

## Which they are

From Google's list (verified, [catalogue](function-catalogue.md)):

- **Fetch from an address**: `IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML`, `IMPORTXML`, `IMAGE`.
- **Read another spreadsheet**: `IMPORTRANGE`.
- **Call a Google service**: `GOOGLEFINANCE`, `GOOGLETRANSLATE`, `DETECTLANGUAGE`.

## Designs

| Concern         | A. A Worker fetches, with guards                                                                                                            | B. Left out                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Parity          | The function works as in Sheets, refreshed on Google's cadence (assumed: hourly for imports)                                                | `#NAME?`-like refusal with a reason; the matrix row reads left out |
| Self-hosting    | Optional: a self-hoster without the route gets the refusal, and nothing else depends on it                                                  | Nothing to host                                                    |
| Abuse           | Server-side request forgery guarded as [security](security.md) says; a per-document rate and a cache                                        | None                                                               |
| Cost            | Worker requests and egress, inside the free tier for normal use (inferred)                                                                  | None                                                               |
| `IMPORTRANGE`   | Between LiveDoc documents only, with the reader's own access and a one-time consent, as Sheets asks (inferred: Sheets shows "Allow access") | Left out                                                           |
| Google services | No free, keyless, licence-clean source for quotes or translation (inferred); C3 maps them to LiveDoc's own or leaves them out               | Left out                                                           |

## Recommendation

- `IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML`, `IMPORTXML`, `IMAGE`: **A**, through the api Worker with the guards,
  optional when self-hosted (S4's default stands).
- `IMPORTRANGE`: between LiveDoc documents, with consent and the reader's access.
- `GOOGLEFINANCE` and `GOOGLETRANSLATE`: **left out (C3, ruled 2026-11-18)**; in an arriving file each keeps its formula
  text and its cached value. `DETECTLANGUAGE` could read either way (a Google service, or a function a small open
  model can answer): it joins the list asked of Webber once with the parity matrix.
