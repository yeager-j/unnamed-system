# ADR: Real-Time Data Strategy — Character Sheets & Combat Tracker

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Last ported from Linear: 2026-06-10.

**Status:** Accepted · **Implemented** (UNN-369 epic: UNN-370–373, PRs #193–#197, 2026-06-10 — see *Realization notes* at the end) · **Owner:** Jackson · **Date:** 2026-06-10
**Supersedes:** [Initiative Tracker ADR](../initiative-tracker/ADR.md), Decision 5 (*"polling behind a seam; SSE and third-party realtime are rejected for v1 but remain drop-in behind the seam"*) — this is that drop-in, decided.
**Related:** [UNN-203](https://linear.app/unnamed-system/issue/UNN-203/make-stale-self-healing-auto-refetch-and-retry-cross-tab-broadcast) (cross-tab BroadcastChannel), [UNN-321](https://linear.app/unnamed-system/issue/UNN-321/real-time-transport-adr)/322/323 (player-view transport + polling), [UNN-324](https://linear.app/unnamed-system/issue/UNN-324/enemy-state-visibility-model) (server-side enemy redaction)

---

## Context

Character sheets and the combat tracker must reflect *other* users' changes in near-real time: a player's sheet should show the damage the DM just applied (the console writes PC vitals through the pools actions); the DM console should show a player's self-heal; the public watch view should track the DM's live tracker edits.

The two data sources are the pure reducers — `reduceCharacter` and `reduceCombatSession`. Both follow the same decider architecture: the wire payload is the *edit/event*, the client mirrors the same reducer optimistically (`useOptimistic`), the server reduces authoritatively, and every write is guarded by optimistic version tokens (per-class on characters, a single `version` on the encounter row).

What exists today:

* **Encounter watch view** polls `/api/encounter/{shortId}/snapshot` every ~1.5s via `useEncounterSnapshot`, whose contract explicitly encapsulates the transport.
* **Character sheet** has cross-**tab** sync only: `BroadcastChannel` → `router.refresh()` ([UNN-203](https://linear.app/unnamed-system/issue/UNN-203/make-stale-self-healing-auto-refetch-and-retry-cross-tab-broadcast)). No cross-**user** sync exists anywhere.
* **DM console** reconciles via `router.refresh()` only after its *own* writes.

Three facts shape the decision:

1. **Redaction is server-side and must stay there.** `projectPlayerSnapshot` strips enemy attributes/affinities before anything reaches a watcher ([UNN-324](https://linear.app/unnamed-system/issue/UNN-324/enemy-state-visibility-model)). Raw `CombatEvent`s (e.g. `adjustEnemyVitals`) carry exactly the data being redacted, so they can never be the payload to public subscribers.
2. **The version columns are a free staleness token.** A "something changed" signal carrying `(domain, id, version)` lets any client decide *ignore (≤ mine) or refetch (> mine)* — no event-ordering protocol needed.
3. **Scale is one table.** A DM + ~5 players + a few watchers ⇒ ≤ ~10 concurrent connections; a heavy 4-hour session is ~500 writes × ~7 subscribers ≈ 3,500 messages (~10–15k/month). Every serious option has >100× headroom; the decision axes are fit, DX, and operational simplicity — never capacity.

**Platform constraint:** Vercel Functions cannot host WebSockets, even with Fluid Compute; Vercel's own guidance for realtime is a third-party pub/sub provider.

---

## Decision summary

| # | Decision | Choice |
| -- | -- | -- |
| 1 | Pattern | **Invalidation ping → refetch through the existing read paths.** Clients never receive domain data over the realtime channel — only `{domain, id, version}` — and respond by re-reading via `router.refresh()` / the snapshot API. |
| 2 | Transport | **Ably** (managed pub/sub; free tier 6M msgs/mo, 200 connections; official React SDK; REST publish from Server Actions). |
| 3 | Fallback | **Polling stays** as the degraded mode — the watch view's existing poll becomes the "realtime unavailable" story, not the primary transport. |
| 4 | Channels + auth | Per-entity channels keyed by **public shortId** (`encounter:{shortId}`, `character:{shortId}`); a token route issues **subscribe-only** capabilities. "You know the shortId, you may subscribe" — the same knowledge-based model the public sheet and snapshot API already use. |
| 5 | Publish point | The **write shells** publish after a successful guarded write (`applyCombatEvent`, the character write wrappers) — the single choke points that already exist. Fire-and-forget; a failed ping degrades to polling, never fails the write. |
| 6 | Escape hatch | **PartyKit/PartyServer on Cloudflare Durable Objects**, documented below. The ping design makes the transport swappable: only the publish helper and subscribe hooks change. |
| 7 | Environments | **One Ably app shared by all environments plus an environment-derived channel namespace** so concurrent PR previews — which share a seed and therefore collide on shortIds — can't cross-talk. Channel naming is server-owned. Per-environment apps remain the documented expansion path. |

---

## Decision 1 — Invalidation ping, not event broadcast, not row sync

**Context.** Because both domains already ship the event as the wire payload and run the same reducer on both ends, broadcasting the `CharacterEdit`/`CombatEvent` itself and reducing locally on every client is *almost* free — the catalogs are client-side, so it works. It is also the lowest-latency option (~300ms saved vs. ping-then-refetch).

**Decision.** Publish only an invalidation ping; subscribers refetch through the existing server read path.

**Why event broadcast loses:**

* **Redaction.** Raw events leak hidden enemy data to public watchers; fixing that means per-audience channels plus an event-filtering/redaction layer that today lives — correctly, unconditionally — in one server-side projector.
* **Gaps.** A client that misses one event (reconnect, sleep, tab restore) holds divergent state forever; gap detection plus a snapshot-refetch fallback would be required anyway. Ping-then-refetch *is* that fallback, promoted to the only path.
* **It's a hand-rolled sync protocol for a six-person table.** The latency saved is below human-noticeable for tabletop play.

**Why row sync (ElectricSQL, Zero, TanStack DB) loses:** those engines sync *rows*, and this architecture deliberately doesn't serve rows — reads go through `deriveHydratedCharacter` and `projectPlayerSnapshot`, the encounter is one jsonb blob, and the redaction projection can't be expressed as a shape filter over jsonb internals. Adopting one means restructuring the read path to buy fan-out scale the app doesn't need.

**Echo suppression falls out of the version compare.** The publisher's own client (and its sibling tabs) receive the ping too; since their local version already matches, the ≤-compare drops it. No sender-id plumbing.

---

## Decision 2 — Ably as the transport

**Context.** Vendors evaluated: Ably, Pusher, Supabase Realtime (Broadcast-only), PubNub, Liveblocks, Firebase RTDB, PartyKit/Durable Objects, self-hosted (Soketi/Centrifugo/socket.io).

**Decision.** Ably.

* **Pusher:** strictly dominated — same message order of magnitude (200k/day vs Ably's 6M/mo) but half the connections (100 vs 200), no comparable React SDK, and the historical precedent of free-tier shrinkage.
* **Supabase Realtime:** capable (200 connections, 2M msgs/mo free), but free projects **pause after ~a week idle**, taking the channel down between game nights. Workable only on the paid plan.
* **PubNub:** free tier is trial-grade; paid starts ~$98/mo. Out.
* **Liveblocks:** collaboration infra (presence/CRDT); overkill for a ping. Revisit if presence features are ever wanted.
* **Firebase RTDB:** works as a ping channel but imports a whole datastore SDK for `{id, version}`.
* **Self-hosted (Soketi/Centrifugo):** requires a 24/7 process — the operational class the Vercel+Neon setup exists to avoid.
* **PartyKit:** the one genuine alternative — see *Escape hatch*.

**Integration shape (all in `apps/web`):**

* `ABLY_API_KEY` in Vercel env (one app for all environments — Decision 7). That is the entire deployment.
* **Publish:** a small `lib/realtime/publish.ts` using Ably's REST client — one HTTP POST per successful write from the write shells. Serverless-safe; no connection held; failure is logged and swallowed (Decision 3 covers the gap).
* **Subscribe auth:** a route handler issuing Ably token requests scoped subscribe-only to the requested `encounter:{shortId}` / `character:{shortId}` channel.
* **Client:** subscribe hooks wired *inside* the existing seams — `useEncounterSnapshot` (whose JSDoc promised exactly this swap) and `CharacterProvider`.

  > **Amended at implementation (UNN-372):** not `ably/react` as originally sketched — the epic built its own primitive instead: `hooks/use-realtime-channel.ts` (token-route auth, server-resolved channel names, reconnect detection, inert-when-unavailable, an optional availability signal for poll-fallback callers) plus its mountable `RealtimeChannelListener` form for dynamic channel lists. One integration style across all four surfaces beat adopting a second (provider-based) one. The v2 **modular** SDK is used as planned but turned out to be **browser-only** — the server's publish path uses the main package's `Ably.Rest` (`lib/realtime/client.ts`) — and the client import is **lazy** (inside the effect), so no page pays for the SDK until a subscribe token was actually issued.
* Engine code (`packages/game`) is untouched; this is entirely an `apps/web` transport concern.

---

## Decision 3 — Polling remains as the degraded mode

The watch view keeps its poll loop as fallback: when the realtime connection is unavailable (older browser, blocked WebSockets, Ably outage, token failure), the hook falls back to the existing ~1.5s interval; on realtime (re)connect it refetches once to close any gap, then idles between pings. The DM console and character sheet degrade to today's behavior (reconcile on own writes / on navigation) plus a reconnect-refetch.

This also keeps E2E and local dev simple: nothing in the test suite depends on the realtime channel; specs keep asserting through `expect.poll` against the DB.

---

## Decision 4 — Channel and auth model

* `encounter:{shortId}` — pinged by `applyCombatEvent` and `endEncounterAction` with the new session `version` and `status`.
* `character:{shortId}` — pinged by the character write wrappers with the touched version classes and their new values. (As implemented the mirroring ran the other way too: UNN-372 extended the `BroadcastChannel` message to carry the versions, and both transports funnel through one shared version-compare — `mergePingedVersions`, defined in `hooks/character-version-sync.ts` and consumed by `CharacterProvider`.)
* Channels are keyed by **public shortId**, never internal UUIDs — matching the existing rule that public surfaces leak no internal id, and making knowledge-of-the-id the subscribe capability, identical to the snapshot API's auth model. Tokens are subscribe-only; **publish capability never leaves the server.**
* Payload is advisory metadata only. Even if a channel id leaks, a subscriber learns "something changed, version N" — all data still flows through the authed/redacting read path.
* Names here are the unqualified form; at runtime every channel is prefixed with the environment namespace from Decision 7.
* **Known cost of single-channel tokens (accepted):** one token covers one channel, so each subscribing hook holds its own connection — the DM console opens 1 + N sockets for N PC combatants. Comfortably inside Ably's limits at table scale; the documented relaxation (one shared connection per page via per-domain wildcard subscribe tokens, with the security reasoning) is [UNN-376](https://linear.app/unnamed-system/issue/UNN-376/realtime-share-one-ably-connection-per-page-via-wildcard-subscribe), triggered by connection-limit pressure or presence features, not a schedule.

---

## Decision 5 — Per-surface behavior

| Surface | Subscribes to | On ping |
| -- | -- | -- |
| **Watch view** | its `encounter:{shortId}` | fetch snapshot (existing API) if `version` > current — the snapshot gained a `version` field (UNN-371) to be that "current" |
| **DM console** | its encounter channel + `character:{shortId}` for each PC combatant (the listener set follows the optimistic roster) | `router.refresh()` (microtask-coalesced) when the pinged version beats the console's tracked tokens — the encounter `versionRef` and a console-owned per-PC vitals map shared with the drawer's pools writes, so its own writes' echoes drop (UNN-373) |
| **Character sheet** (owner + public) | its `character:{shortId}` | `router.refresh()` if any pinged class version > local |
| **Campaign page** (live banner) | **every non-ended** encounter channel — drafts included, since "the banner appears on combat start" means hearing a draft's `status: "live"` ping (amended in UNN-373 from "the live encounter channel") | `router.refresh()` **only on a status change** — every combat event pings the live channel, and refreshing per turn would be a storm |

**Remote ping vs. in-flight optimistic edits (resolved):** handle it exactly like the cross-tab broadcast already does — `router.refresh()` and let the version guards arbitrate. React rebases `useOptimistic` state onto the refreshed server value; the per-class version refs re-sync from props; the per-class save queues already serialize same-class writes; a genuinely conflicting remote write surfaces as the existing `stale` toast. Deferring the refresh until a pending transition settles is an implementation nicety, not architecture.

**[UNN-203](https://linear.app/unnamed-system/issue/UNN-203/make-stale-self-healing-auto-refetch-and-retry-cross-tab-broadcast)'s `BroadcastChannel` becomes a candidate for retirement:** the server-side ping reaches the sender's sibling tabs too, and the version compare suppresses true echoes. Keep it through the rollout, retire once the Ably path is proven (it remains the no-realtime fallback for cross-tab until then). *Decision recorded on UNN-203 (UNN-372): **kept** — it is the only cross-tab path when realtime is unavailable, and it now carries versions and routes through the same shared compare as the Ably ping, so the two transports never double-refresh a tab. Revisit after soak.*

---

## Decision 6 — Escape hatch: PartyKit on Cloudflare

If Ably's free tier shrinks or the vendor relationship sours: a ~100-line PartyServer worker on Cloudflare Durable Objects (free tier ~3M DO requests/mo, 20:1 WebSocket message ratio, hibernation API for idle connections), deployed to our own CF account via `partykit deploy` with no platform fee. Rooms keyed by the same channel names; Server Actions POST the ping with a shared secret; clients connect via `partysocket`.

Cost of switching later: the publish helper + the subscribe hooks — nothing else, because subscribers only ever receive `{domain, id, version}`. Building the worker *now* was rejected as permanent operational surface (second deploy target, CI step, secrets in two places, second debugging dashboard) bought for headroom ~100× beyond need.

---

## Decision 7 — Deployment environments & preview isolation

**Context.** The app runs in three environments: **dev** (local `npm run dev`), **preview** (one Vercel deployment per PR — each PR gets its own Neon branch `preview/<branch>`, migrated and seeded, with Playwright run against the deployment via the `vercel.deployment.success` dispatch), and **prod**. The Neon-branch-per-PR model makes each preview a fully isolated data world — but every preview is seeded *identically*, so public shortIds **collide across previews by construction**: every concurrent PR has the same seeded encounter and character shortIds. A shared realtime namespace would cross-wire them — the DM console on PR A's preview pinging watchers on PR B's preview — producing phantom refetches and flaky E2E. The realtime layer must reproduce the isolation the database already has.

**Decision.** One Ably app shared by all environments, isolated by **an environment-derived channel namespace**: the full channel name is `{ns}:{domain}:{shortId}`, where `ns` is `prod` in production, `pr-` + the slugified `VERCEL_GIT_COMMIT_REF` in preview (the same per-branch identity the `preview/<branch>` Neon branch name derives from), and `dev` locally. The single `ABLY_API_KEY` is set across Vercel environments.

> **Amended at implementation (UNN-370, 2026-06-10):** the original decision split this into one Ably app per environment (dev / preview / prod, key scoped per Vercel environment like `DATABASE_URL`) as a hard credential boundary on top of the namespace. We start with one app instead: the namespace alone provides all the cross-talk isolation, and because pings are advisory metadata only (Decision 4), the blast radius of a cross-environment key is phantom refetches — never data exposure. It's a two-way door: the per-environment split needs no code change (create the apps, re-scope the env var) and remains the expansion path if a harder credential boundary is ever wanted.

**Server-owned naming keeps the namespace out of client hands.** One helper — `lib/realtime/channels.ts` — composes channel names from its own environment; the publish helper uses it, and the token route takes `{domain, shortId}`, resolves the full name itself, and returns it alongside a token whose capability is scoped to exactly that channel. Clients never assemble channel names (no `NEXT_PUBLIC_` namespace exposure), so a client on one preview can't attach to another preview's channels even inside the shared app. The threat model here is cross-talk correctness, not secrecy — pings are advisory metadata either way (Decision 4) — but flaky-by-collision E2E is reason enough.

Consequences:

* **Local dev needs zero Ably setup.** With `ABLY_API_KEY` unset, the publish helper no-ops and the token route reports unavailable, so clients run the Decision 3 polling fallback. The key is opt-in in `.env.local` for when the realtime feature itself is being worked on. Parallel worktrees share the local database, so sharing the `dev` namespace is correct, not a leak — same data, same versions.
* **E2E is unaffected by design** (Decision 3: specs assert via `expect.poll` against the DB, never through the channel). With the key set, realtime is simply live during E2E under that PR's namespace, isolated from concurrent runs on other PRs.
* **No teardown analog to `neon.yml`'s branch deletion is needed:** Ably channels are ephemeral — garbage-collected minutes after the last attach — so a closed PR leaves nothing behind.

---

## Options considered and rejected

| Option | Verdict |
| -- | -- |
| **Extend polling everywhere** | Viable at this scale, zero new infra — but latency is floor-bound at the interval, every surface pays constant request churn, and it was already designated a stopgap. Retained as the fallback (Decision 3), not the strategy. |
| **SSE from a route handler** | Fluid Compute allows it (300s/800s max duration ⇒ reconnect loop), but the function must still *learn* of changes: server-side DB polling (poll moved, now billed wall-clock per open stream) or Neon LISTEN/NOTIFY (direct connections only, notifications lost across compute suspends). More moving parts than polling, less reliable than managed pub/sub, no payoff. |
| **Broadcast the event, reduce locally** | Rejected — redaction + gap handling; see Decision 1. |
| **Read-path sync engine (ElectricSQL/Zero)** | Rejected — row-sync misfits the projection-based read architecture; see Decision 1. |
| **Platform migration (Convex, Supabase-as-database)** | Solves the problem by replacing Neon/Drizzle/Server Actions wholesale. Not considered further. |

---

## Cost & limits

Estimated usage (~10–15k messages/mo, ≤10 concurrent connections) vs. Ably free tier (6M msgs/mo, 200 connections): ~400× headroom. The failure mode if limits are ever hit is graceful — pings stop, polling fallback takes over.

## Non-goals

* Presence ("DM is online"), typing/cursor indicators — Liveblocks territory, not needed.
* Offline support / conflict-free merging — the version guards + stale toast remain the conflict model.
* Realtime for the builder, My Characters, or campaign management CRUD — single-writer surfaces; navigation-time freshness is fine.

## Ticket breakdown (as shipped)

1. ✅ **Realtime foundation** — [UNN-370](https://linear.app/unnamed-system/issue/UNN-370/realtime-foundation-ably-apps-channel-namespace-publish-helper-token) (PR #193): `lib/realtime/channels.ts` (env-namespaced naming, Decision 7), `lib/realtime/publish.ts` (pings scheduled via `next/server` `after()`, post-commit), token route, publish calls in `applyCombatEvent` / `endEncounterAction` / the character write choke points.
2. ✅ **Character sheet** — [UNN-372](https://linear.app/unnamed-system/issue/UNN-372/character-sheet-realtime-subscription-in-characterprovider) (PR #194): `useRealtimeChannel` primitive + subscribe in `CharacterProvider`; shared version-compare unifying the Ably ping and the UNN-203 broadcast; keep decision recorded on UNN-203.
3. ✅ **DM console + campaign live banner** — [UNN-373](https://linear.app/unnamed-system/issue/UNN-373/dm-console-campaign-live-banner-subscribe-routerrefresh) (PR #195; the banner item folded in as planned).
4. ✅ **Watch view** — [UNN-371](https://linear.app/unnamed-system/issue/UNN-371/watch-view-realtime-subscription-with-polling-fallback) (PR #197): subscribe-with-poll-fallback inside `useEncounterSnapshot`; `EncounterSnapshot` gained `version`.

---

## Realization notes (2026-06-10, epic complete)

The ADR is fully realized; every Decision shipped as written except the deviations below, each amended inline above:

* **One Ably app, not three** (Decision 7 amendment) — namespace-only isolation; per-environment apps remain the expansion path.
* **No `ably/react`** (Decision 2 amendment) — the epic's own `useRealtimeChannel` / `RealtimeChannelListener` primitive serves all four surfaces; the modular SDK proved browser-only (server publishes via `Ably.Rest`) and is imported lazily.
* **Campaign banner subscribes to all non-ended encounters** and refreshes only on a status change (Decision 5 table) — the original "live encounter channel" wording couldn't make the banner *appear*, and per-turn pings made unconditional refresh a storm.
* **`EncounterSnapshot.version`** was added (UNN-371) so the watch hook has a "current" for the ping compare — the same advisory token the channel already carries.
* **UNN-203 kept** (decision recorded on the ticket): the broadcast now carries versions through the same shared compare; retirement revisited after soak.

Deferred with tickets, deliberately not built:

* [UNN-374](https://linear.app/unnamed-system/issue/UNN-374/consolidate-version-token-handling-into-a-first-class-client-primitive) — consolidate the spread-out version-token handling into one client primitive (trigger: the next surface that needs tokens).
* [UNN-375](https://linear.app/unnamed-system/issue/UNN-375/make-startcombats-session-save-status-flip-one-atomic-guarded-write) — make `startCombat`'s session save + status flip one atomic guarded write.
* [UNN-376](https://linear.app/unnamed-system/issue/UNN-376/realtime-share-one-ably-connection-per-page-via-wildcard-subscribe) — one shared connection per page via wildcard subscribe tokens (trigger: connection-limit pressure or presence features).
* Decision 5's "defer the refresh until a pending transition settles" nicety — not implemented, per its own text ("an implementation nicety, not architecture"); the version guards arbitrate as designed.
