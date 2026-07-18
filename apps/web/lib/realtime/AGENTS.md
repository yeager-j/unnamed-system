# `lib/realtime` — Ably invalidation pings

Ably invalidation pings (UNN-370; design in `docs/realtime/ADR.md`).

- **channels.ts** is the ONLY place env-namespaced channel names (`{ns}:{domain}:{shortId}`) are assembled.
- **client.ts** is the lazy REST client (null without `ABLY_API_KEY` ⇒ the whole layer no-ops and clients poll).
- **publish.ts** fires advisory pings from the write choke points (version-guard + the two bespoke writes + the encounter shells) via `next/server` `after()`.

Subscribe tokens: `app/api/realtime/token` (subscribe-only, single channel).

Client side: `lib/sync/use-realtime-channel.ts` is the generic subscribe hook (modular Ably SDK, token-route auth, inert when unavailable). The v2 `EntityWriteProvider` (sheet + builder + atlas) mounts one `character` listener: writable owner mounts feed invalidations into the replica transport's causal snapshot gate; read-only mounts refresh their RSC frame because the strict-owner replica is unavailable to them. Combat/dungeon readers still use `lib/sync/character-version-sync.ts` for their classic token comparison. The UNN-203 BroadcastChannel transport is retired.
