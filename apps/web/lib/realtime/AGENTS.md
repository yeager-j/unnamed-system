# `lib/realtime` — Ably invalidation transports

Ably invalidation pings (UNN-370; design in `docs/realtime/ADR.md`) plus the
Headcanon axis-invalidation client (UNN-676).

- **channels.ts** is the ONLY place env-namespaced ping channel names
  (`{ns}:{domain}:{shortId}`) are assembled. Headcanon axis channels are the
  package's own scheme (`{ns}:headcanon:axis:v1:{sha256}`), derived by
  `@workspace/headcanon/ably/channels` — never assembled here.
- **client.ts** is the lazy REST client (null without `ABLY_API_KEY` ⇒ the whole layer no-ops and clients poll).
- **publish.ts** fires advisory pings from the write choke points (finalize's version-guard + the bespoke writes + the encounter shells + the entity door's transitional Phase-3a bridge) via `next/server` `after()`.
- **axis-invalidations.ts** is the Headcanon client transport: a lazy
  `InvalidationAdapter` the entity predicted root subscribes through. It loads
  `ably/modular` on first subscription, fetches the namespace from the token
  route, and delegates exact-set authorize/attach/dedup/gap-recovery to
  `createAblyInvalidationAdapter` (`@workspace/headcanon/ably/client`).

Subscribe tokens: `app/api/realtime/token`. Two admitted shapes — `{domain, shortId}`
resolves one ping channel server-side; `{capability}` validates and signs the exact
hashed axis-channel set a mounted root observes. `GET` exposes the namespace.

Client side: `lib/sync/use-realtime-channel.ts` is the generic ping subscribe hook
(modular ably SDK, token-route auth, inert when unavailable) — still what combat
(`write-lanes.ts`/`pc-ping.ts`) and the dungeon explore body wire through
`lib/sync/character-version-sync.ts`. The character surfaces left it in P2d
(UNN-676): `EntityWriteProvider` mounts a Headcanon predicted root whose axis
subscription replaces the `character`-channel version-compare; the entity door
republishes accepted mutations as legacy pings only until Phase 3a moves the
combat/dungeon listeners onto axes.
