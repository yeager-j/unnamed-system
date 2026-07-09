# `lib/realtime` — Ably invalidation pings

Ably invalidation pings (UNN-370; design in `docs/realtime/ADR.md`).

- **channels.ts** is the ONLY place env-namespaced channel names (`{ns}:{domain}:{shortId}`) are assembled.
- **client.ts** is the lazy REST client (null without `ABLY_API_KEY` ⇒ the whole layer no-ops and clients poll).
- **publish.ts** fires advisory pings from the write choke points (version-guard + the two bespoke writes + the encounter shells) via `next/server` `after()`.

Subscribe tokens: `app/api/realtime/token` (subscribe-only, single channel).

Client side: `hooks/use-realtime-channel.ts` is the generic subscribe hook (modular ably SDK, token-route auth, inert when unavailable); the character surfaces wire it through `hooks/character-version-sync.ts` — the v2 `EntityWriteProvider` (sheet + builder, UNN-569) and the v1 `CharacterProvider` (atlas) each mount a `character`-channel listener behind a forward-only version-compare, which also covers cross-tab convergence (the UNN-203 BroadcastChannel transport is retired).
