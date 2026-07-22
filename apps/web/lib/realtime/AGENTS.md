# `lib/realtime` — Ably invalidation transports

Ably invalidation pings (UNN-370; design in `docs/realtime/ADR.md`) plus the
Headcanon axis-invalidation client (UNN-676).

- **channels.ts** is the ONLY place env-namespaced ping channel names
  (`{ns}:{domain}:{shortId}`) are assembled. Headcanon axis channels are the
  package's own scheme (`{ns}:headcanon:axis:v1:{sha256}`), derived by
  `@workspace/headcanon/ably/channels` — never assembled here.
- **client.ts** is the lazy REST client (null without `ABLY_API_KEY` ⇒ the whole layer no-ops and clients poll).
- **publish.ts** fires advisory pings from legacy write choke points and the entity door's dungeon bridge via `next/server` `after()`.
- **axis-invalidations.ts** is the single tab-lifetime Headcanon client transport
  shared by entity and combat predicted roots. The package-owned lazy adapter
  buffers early subscriptions and owns unavailable initialization. The app loads
  `ably/modular` on first subscription, fetches the namespace from the token
  route, and delegates exact-set authorize/attach/dedup/gap-recovery to
  `createAblyInvalidationAdapter` (`@workspace/headcanon/ably/client`).

Subscribe tokens: `app/api/realtime/token`. Two admitted shapes — `{domain, shortId}`
resolves one ping channel server-side; `{capability}` validates and signs the exact
hashed axis-channel set a mounted root observes. `GET` exposes the namespace.

Client side: `lib/sync/use-realtime-channel.ts` remains the generic legacy ping
subscribe hook for dungeon exploration and public snapshots. Entity and combat
surfaces use Headcanon axes; combat's per-character listeners and version
comparison were deleted in P3a. The entity door republishes legacy character
pings only for the still-unmigrated dungeon listener.
