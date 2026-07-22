# `lib/realtime` — Ably invalidation transports

Headcanon axis invalidation over Ably (design in `docs/realtime/ADR.md`).

- **channels.ts** owns only the deployment namespace. Headcanon axis channels
  use the package scheme (`{ns}:headcanon:axis:v1:{sha256}`).
- **client.ts** is the lazy REST client (null without `ABLY_API_KEY` ⇒ the whole layer no-ops and clients poll).
- **axis-invalidations.ts** is the single tab-lifetime Headcanon client transport
  shared by predicted and observe-only roots. The package-owned lazy adapter
  buffers early subscriptions and owns unavailable initialization. The app loads
  `ably/modular` on first subscription, fetches the namespace from the token
  route, and delegates exact-set authorize/attach/dedup/gap-recovery to
  `createAblyInvalidationAdapter` (`@workspace/headcanon/ably/client`).

Subscribe tokens: `app/api/realtime/token`. `{capability}` validates and signs
the exact hashed axis-channel set a mounted root observes; `GET` exposes the
namespace. Public watch roots wrap this adapter with the package polling
fallback, so missing Ably configuration preserves catch-up.
