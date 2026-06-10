# ADR: Real-Time Transport — Ably vs PartyKit

> **Canonical source.** This document lives in the repo and is the source of truth. Status is **Proposed** — it records an evaluation and a recommendation; no code has been changed.

**Status:** Proposed · **Owner:** Jackson
**Related:** [Initiative Tracker — ADR](../initiative-tracker/ADR.md) (Decision 4 "the event is the wire payload", Decision 5 "player-view transport: polling behind a seam") · `apps/web/hooks/use-encounter-snapshot.ts` · `apps/web/lib/actions/encounter/events.ts`

---

## Context

The Initiative Tracker shipped its player-watch view on **polling** — `useEncounterSnapshot` re-fetches `/api/encounter/{shortId}/snapshot` every ~1.5s — and that was a deliberate, documented placeholder. Initiative-Tracker ADR **Decision 5** says verbatim:

> "Polling … behind a swappable transport seam (`useEncounterSnapshot(encounterId)` — internals can switch to SSE/push without touching the view). … SSE and third-party realtime are rejected for v1 but remain drop-in behind the seam."

This ADR is the promised follow-up: **which push transport do we drop in behind that seam**, evaluated as **Ably vs PartyKit**.

### The two facts that dominate the decision

1. **We are on Vercel serverless + Neon.** Vercel functions and Server Actions are short-lived request/response — **they cannot hold a long-lived WebSocket**. So the persistent socket *must* terminate on something other than our Next.js server. That is the entire reason a third-party realtime layer is on the table. The two candidates terminate the socket in fundamentally different places:
   - **Ably** — a fully-managed global pub/sub edge. Our Vercel code *publishes* to Ably over a single REST call; browsers *subscribe* to Ably over WebSocket. Ably is a **transport**; it holds no application logic.
   - **PartyKit / PartyServer** — a **Cloudflare Durable Object** *is* the stateful WebSocket server. It is a second deployable that runs on Cloudflare (not Vercel), and its whole value proposition is that it can hold **authoritative in-memory state** and run **your code** next to the socket.

2. **The write path is already settled and the reducer already has a home.** Per Initiative-Tracker Decision 4, the DM is the **sole writer**; `applyCombatEvent` (a Vercel Server Action) authorizes the DM, runs `reduceCombatSession` server-side, and persists the result to Neon **version-guarded**. The DM client mirrors the *same* `reduceCombatSession` optimistically via `useOptimistic`. The signed-out player view **does not reduce anything** — it renders a **redacted** snapshot (enemy affinities/attributes stripped server-side in `load-encounter-snapshot.ts → resolve-player-view.ts`).

### Re-framing the brief's premise about the reducers

The brief notes that `reduceCharacter` / `reduceCombatSession` "are probably what the real time data library would call for updates." That is true in **exactly one** of the two architectures below, and it is the more invasive one. Making this explicit is the spine of the decision:

| Model | Who runs the reducer | Source of truth | What the realtime layer does | Change size |
| -- | -- | -- | -- | -- |
| **A. Broadcast / fan-out** (transport-only) | `applyCombatEvent` Server Action (**unchanged**) + DM-client `useOptimistic` (**unchanged**) | **Neon** (unchanged) | Carries a *notification* that the snapshot changed, so the watch view stops polling and updates on push | **Small, reversible** — lives entirely behind the existing seam |
| **B. Authoritative server** (stateful) | A **Cloudflare Durable Object** runs `reduceCombatSession` on each event, holds the live `CombatSession` in memory, broadcasts to all sockets, persists to Neon async | **The Durable Object** (Neon becomes a backup) | *Is* the write path, the concurrency authority, and the fan-out | **Large** — relocates the source of truth, re-implements auth + version-guard + redaction inside a Worker, adds a second deploy |

Model A is what both products can do and what the current code is shaped for. Model B is **only** unlocked by PartyKit, and it is where "the realtime lib calls the reducer" literally happens — but it is a re-architecture, not a transport swap. Keep this table in mind through the comparison; it is why the two products are *not* like-for-like.

A relevant property of `packages/game`: the reducers are a **runtime-pure leaf** (no React/Next/DB), and they take their catalog lookups + `newId` as explicit args bound at a composition root (`apps/web/lib/game-engine.ts`). That purity means the reducer *could* run inside a Cloudflare Worker — but doing so requires a **second composition root** inside the Worker bundle (binding `gameData`, shipping the catalog into the Worker). That is feasible, and it is exactly the cost of Model B.

---

## Decision summary

| # | Question | Finding |
| -- | -- | -- |
| 1 | What does the seam actually need? | A **read-path push** for the redacted player snapshot (and, later, optional sheet co-viewing). Not a new write path. |
| 2 | Pricing at our scale | **Non-differentiating.** A few players per encounter, human turn cadence — both sit comfortably in free tiers. |
| 3 | Deployment surface | **Ably adds zero deploy targets** (an env var + a REST publish). **PartyKit adds a second deployable** (a Cloudflare Worker/Durable Object) with its own wrangler config and per-PR preview story. |
| 4 | DX fit to *our* architecture | **Ably** drops into the seam 1:1 (publish on write, subscribe in the hook). **PartyKit** is delightful *only if* we adopt Model B; as a dumb relay it wastes its whole point. |
| 5 | Redaction safety | Strongest pattern is **broadcast a "changed" ping; client re-fetches the already-redacted snapshot.** Server stays the sole authority on what a player sees; nothing sensitive crosses the wire. Both products support it; it self-heals to today's polling. |
| 6 | Strategic risk | **PartyKit was acquired by Cloudflare (Oct 2025)**; the hosted PartyKit cloud's roadmap is now subordinate to Cloudflare's "PartyServer on raw Durable Objects" direction. The "PartyKit magic" is in flux. Ably is an independent, mature, focused realtime vendor. |
| — | **Recommendation** | **Adopt Ably, in Model A (ping + re-fetch), behind the existing `useEncounterSnapshot` seam.** Revisit PartyServer/Durable Objects only if the product later needs many concurrent sub-100ms writers (collaborative editing / live token-dragging). |

---

## The candidates, against *this* codebase

### Ably

**What it is.** A managed realtime pub/sub platform (channels, presence, history, token auth with per-channel capabilities). You never run a server; you publish and subscribe.

**How it would wire in here.**
- **Publish:** at the tail of `applyCombatEvent`, after the version-guarded `saveEncounterSession` commits, fire one Ably REST publish to channel `encounter:{shortId}` — payload as small as `{ version }`. This is a single fire-and-forget HTTP call from a short-lived Server Action — exactly the shape serverless wants. **Do not** open an Ably *realtime* (socket) connection inside a function; use the REST publish.
- **Subscribe:** swap the body of `useEncounterSnapshot` from `setInterval(fetch)` to an Ably channel subscription. On each message, do **exactly what a poll tick does today** — call the existing `fetchSnapshot(shortId)`, which returns the **redacted** projection. The view never changes; the seam was built for precisely this.
- **Auth/redaction:** a tiny Vercel token endpoint mints Ably tokens with **subscribe-only** capability on `encounter:*` for players. The full session never leaves Neon; players only ever receive a "something changed" nudge and then read the same redacted API they read today. Redaction stays 100% server-authoritative.

**Why it fits.** It is a *transport*, and Decision 5 asked for a transport. The write path, the reducer's location, the version-guard, and the redaction boundary are **all untouched**. If Ably is unreachable, the hook can fall back to polling — strictly additive, fully reversible.

**DX.** Mature TS SDK; **official React hooks** (`AblyProvider`, `useChannel`, `usePresence`). Presence is a free bonus we'd get for later ("3 players watching", campaign online indicators). Extensive docs.

**Pricing.** Free tier: **6M messages/mo, 200 concurrent connections, 200 channels**, 500 msg/s, unlimited subscribers/channel. Paid is usage-based (≈$2.50/M messages, or MAU pricing ≈$0.05/MAU). At our scale (a handful of viewers per encounter, a message only when the DM acts) we are **orders of magnitude inside free** and would likely never pay. ([limits](https://ably.com/docs/pricing/limits), [free package](https://ably.com/docs/platform/pricing/free), [pricing](https://ably.com/pricing))

### PartyKit

**What it is.** A framework for stateful realtime servers built on **Cloudflare Durable Objects**: you write a `Server` class with `onConnect` / `onMessage` / `broadcast`, and a `usePartySocket` client hook. Each "room" (here, each encounter) is one Durable Object holding live state in memory.

**Where it stands in 2026 (decision-critical).** Cloudflare **acquired PartyKit in October 2025**. Cloudflare's stated direction is **PartyServer** — the PartyKit ideas re-expressed as a library over **raw Durable Objects** in your own Cloudflare account ([Cloudflare's acquisition post](https://blog.cloudflare.com/cloudflare-acquires-partykit/), [cloudflare/partykit](https://github.com/cloudflare/partykit)). PartyKit's own docs still say "by default we manage the platform," but cloud-prem (your own CF account) is the path being invested in ([deploy-to-cloudflare guide](https://docs.partykit.io/guides/deploy-to-cloudflare/)). Net: adopting "PartyKit" today means betting on either a hosted product whose roadmap is now subordinate to Cloudflare's DO strategy, **or** writing directly against PartyServer + Durable Objects (more code, you own and deploy the Worker). The frictionless hosted DX that made PartyKit attractive is in transition.

**How it would wire in here — and the fork it forces.**
- **As a dumb relay (Model A):** the DM client (or `applyCombatEvent`) posts a "changed" message to the room; the DO `broadcast`s it; player sockets re-fetch the redacted snapshot. This works — but it uses a stateful Durable Object purely as a notification pipe, **paying the full operational cost of a second deployable for none of its advantage.** Ably does this same job with zero new infra.
- **As an authoritative server (Model B):** the DO becomes the live home of the `CombatSession`, runs `reduceCombatSession` on each event, and is the concurrency authority. This is the *only* configuration where PartyKit out-classes Ably — and it means:
  - A **second composition root** inside the Worker (bind `gameData`, ship the catalog into the Worker bundle).
  - **Re-implementing inside the Worker** what `applyCombatEvent` already does well on Vercel: DM authorization (`requireCampaignDM`), the **version-guard** concurrency primitive, and the **redaction** split (full view for the DM socket, redacted for player sockets).
  - **Relocating the source of truth** off Neon (or running a two-writer reconciliation between the DO and Neon) — directly against Initiative-Tracker Decision 3's "one `encounters` row, one `version` column, the DM is the sole writer."
  - A **second deploy pipeline** (wrangler) parallel to Vercel, plus a **per-PR preview story** for the Worker to match the existing Vercel-preview + Neon-branch E2E flow (`.github/workflows/e2e.yml`).

**DX.** Genuinely excellent — *for Model B*. `broadcast`, hibernation, `usePartySocket`, per-room isolation, and (via Y-PartyServer) first-class CRDT/Yjs for collaborative editing. If the product were many-writer real-time collaboration, this is the better substrate.

**Pricing.** Durable Objects have a free tier (~3M requests/mo, ~390K GB-s); incoming WS messages bill 20:1, outgoing free; SQLite-DO storage billing began Jan 2026. Workers Paid is $5/mo if you exceed free. Also trivially cheap at our scale. ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)) — **again, not the differentiator.**

---

## Head-to-head

| Dimension | Ably | PartyKit / PartyServer |
| -- | -- | -- |
| **Fit to the existing seam (Decision 5)** | ✅ Drop-in transport; nothing else moves | ⚠️ Drop-in only as a relay (wastes it); real fit means Model B re-architecture |
| **Touches the write path / reducer location** | ❌ No — reducer stays in the Server Action | Model A: no · **Model B: yes** — reducer moves into a Worker |
| **New deploy targets** | **None** (env var + REST publish) | **One** (Cloudflare Worker/DO + wrangler + per-PR preview) |
| **Source of truth** | **Neon, unchanged** | Model A: Neon · **Model B: the Durable Object** |
| **Redaction stays server-authoritative** | ✅ via ping + re-fetch (+ subscribe-only tokens) | ✅ but you write it inside the DO |
| **Concurrency model** | Reuses the existing **version-guard**; sole writer | Model B re-implements version-guard in the Worker |
| **Latency** | ~tens of ms globally (more than enough for a turn-based table) | Edge-local; matters only for high-frequency multi-writer |
| **DX** | Mature SDK + official React hooks + presence | Excellent **for stateful multiplayer**; in roadmap flux post-acquisition |
| **Pricing at our scale** | Free, comfortably | Free / $5, comfortably |
| **Strategic risk** | Independent, focused vendor | Roadmap now subordinate to Cloudflare's DO strategy |
| **Where it would win** | Read-path push, presence, "broadcast after a DB write" | Many concurrent sub-100ms writers; CRDT co-editing |

**The asymmetry that decides it:** our product is a **DM-sole-writer, no-dice, read-only-player-view, ~1.5s-tolerant** turn tracker. Every headline advantage of a Durable Object — in-memory authoritative state, conflict-free high-frequency fan-in from many writers, edge co-location for sub-100ms feel — is **dead weight** when there is exactly one writer moving at human turn cadence. The job in front of us is "fan a change out to a few read-only viewers after a DB write," which is the textbook Ably use case and the exact thing the seam was carved for.

---

## Environments (dev / preview / production)

We need three standing environments, and **E2E runs against per-PR Preview deploys** where the workflow already provisions a fresh `preview/<branch>` Neon branch (migrate + seed), runs Playwright against the Vercel preview URL, and deletes the branch on PR close (`.github/workflows/e2e.yml`, `.github/workflows/neon.yml`). Any realtime layer has to slot into that flow without weakening its isolation — two concurrent preview deploys must not cross-talk on a shared channel.

The two products isolate at **different grains**, and this is a real differentiator:

| | Ably | PartyKit |
| -- | -- | -- |
| **Unit of isolation** | An **app** (own keys, own channel namespace, own quota) — and, *within* an app, the **channel namespace** | A **deploy** (`partykit deploy --preview <name>` → its own URL + running DOs) |
| **Standing dev/preview/prod** | **Three apps**, three API keys, wired through Vercel's per-environment env-var scoping (Development / Preview / Production) — no automation needed | A standing prod deploy + named deploys; env vars per deploy |
| **Per-PR isolation** | A **channel-name prefix** (e.g. `preview-<branch>:encounter:<shortId>`) on the shared *preview* app — **nothing to create or tear down** | `partykit deploy --preview pr-<n>` in CI + teardown on close — a second per-PR provision/deploy parallel to the Neon branch |
| **Teardown** | None — idle channels auto-close | Must delete the preview deploy on PR close (another `neon.yml`-style job) |
| **Programmatic provisioning** | **Control API** can create/delete apps + keys in CI if you ever want app-per-PR ([Control API](https://ably.com/blog/introducing-control-api-provision-configure-ably-programmatically)) | The deploy *is* the provisioning step ([Preview environments](https://docs.partykit.io/guides/preview-environments/)) |

**Yes, Ably supports distinct environments — but the natural mapping is lighter than PartyKit's, not heavier.** Two layers:

1. **Three standing apps for dev / preview / production.** Ably apps are fully isolated (separate keys, channels, quotas). Vercel already scopes env vars per environment, so you set `ABLY_API_KEY` (server publish) and the public client key three times — once per Vercel environment — each pointing at its own Ably app. This is the standard Ably multi-env pattern and needs **zero CI automation**.
2. **Per-PR isolation by channel prefix, not by a new app.** This is the part that maps to "a fresh Neon branch per PR." Because two preview deploys share the *preview* app and the seed mints deterministic `shortId`s, they could both publish to `encounter:<sameShortId>` and cross-talk. The fix is a **deploy-scoped channel prefix** — derive it from `VERCEL_GIT_COMMIT_REF` (or the Vercel deployment id) and inject it as `ABLY_CHANNEL_PREFIX`, used identically on the publish side (`applyCombatEvent`) and the subscribe side (`useEncounterSnapshot`). Channels are namespaces, not provisioned resources, so there is **nothing to migrate and nothing to delete** — they wink out when idle. It is strictly *less* machinery than the Neon-branch-per-PR step it rides alongside.

If we ever want a literal 1:1 with the Neon-branch flow (an ephemeral, fully-quota-isolated app per PR), the **Control API** can create the app + key in the existing dispatch workflow and delete it from the `neon.yml` PR-close job. **Recommendation: don't.** Channel-prefixing gives the same isolation guarantee for E2E for none of the create/teardown cost; reserve app-per-PR for the day a preview needs its own quota or rate-limit envelope.

**PartyKit's `--preview` is the closer literal match** — a per-PR environment with its own URL — and if we were already standing up a Cloudflare deploy it would compose neatly with CI. But that match exists *because PartyKit is a deploy target*: every preview is another running server to deploy, (in Model B) seed, and tear down, on top of the Neon branch and Vercel preview we already manage. For E2E, Ably's "no deploy, just a key + a prefix" is less to break.

> **Net:** environments are **not** a reason to pick PartyKit. Ably covers dev/preview/prod with three keys and covers per-PR E2E isolation with a one-string channel prefix — fewer moving parts than the Neon-branch step it sits beside, and no new teardown job.

---

## Recommendation

**Adopt Ably, in Model A, behind `useEncounterSnapshot`, using the "broadcast a `version` ping → client re-fetches the redacted snapshot" pattern.**

Rationale, concisely:
1. **It matches the seam's stated intent** (Decision 5) and changes nothing about the write path, the reducer, the version-guard, or the redaction boundary.
2. **Ping-then-refetch is self-healing.** Neon stays the source of truth; a dropped or out-of-order message just means the next poll/ping reconciles to the authoritative redacted snapshot. It degrades gracefully to *exactly today's behavior* if Ably is unavailable — a strong correctness property for free.
3. **Redaction never leaves the server.** Nothing sensitive transits the channel; players get a nudge and read the same redacted API they read today, gated by subscribe-only tokens.
4. **Zero new operational surface.** No second deploy, no second preview pipeline, no Worker composition root — consistent with the project's repeated "zero new infra" stance (CLAUDE.md; Decision 5).
5. **Pricing is a non-issue** for both; it should not drive the choice.
6. **PartyKit's only real edge requires Model B**, which relocates the source of truth and duplicates machinery we already have on Vercel/Neon — disproportionate cost for a single-writer, turn-paced tracker, and against a vendor roadmap currently in flux.

### Revisit-if triggers (when PartyServer/Durable Objects becomes the right call)

- The product gains **many concurrent low-latency writers** — e.g., each player drags **their own token** live with sub-100ms feel, or real-time collaborative cursors.
- **CRDT/Yjs collaborative editing** of shared text (campaign notes, shared maps) becomes a goal — Y-PartyServer is purpose-built for it.
- You want the encounter to be a **truly authoritative in-memory live object** independent of request/response and DB round-trips.

None of these are in current scope (DM sole writer, no dice, read-only player view). If one arrives, this ADR should be reopened — and at that point the choice is **PartyServer on your own Cloudflare account**, not the hosted PartyKit cloud.

---

## Consequences of the recommendation

- **`reduceCharacter` / `reduceCombatSession` stay exactly where they are** — in the Server Action (authoritative) and the DM client (`useOptimistic`). The realtime layer never calls them. This is the opposite of the brief's working assumption, and it is the *point*: the seam was designed so the reducer doesn't have to move.
- **`useEncounterSnapshot` gains an Ably-backed fetcher**; its public signature (and every consumer) is unchanged. The existing polling path stays as the fallback, so the change is additive and reversible.
- **Env vars per Vercel environment** — `ABLY_API_KEY` (+ the public client key) set three times, once each for Development / Preview / Production, pointing at three isolated Ably apps; plus an `ABLY_CHANNEL_PREFIX` derived per deploy for per-PR E2E isolation (see _Environments_). **One tiny token endpoint** and **one publish line** at the end of `applyCombatEvent`. No migrations, no new tables, no new service, no new CI teardown job.
- **Character-sheet live co-viewing** (if ever wanted) reuses the identical pattern: publish a ping on the owner's write, subscribers re-fetch. No reducer relocation.
- **Presence becomes available** as a cheap future feature (live "who's watching", campaign online dots) at no extra infrastructure.

---

## Open questions

- **Ping vs. thin-payload broadcast.** The recommendation is a `{ version }` ping + re-fetch (safest for redaction, self-healing). If re-fetch latency ever feels heavy, we could broadcast the already-redacted snapshot on a player channel — but only with the DM/player channel split and capability tokens. Default to ping until measured need.
- **Token endpoint placement.** A small Vercel route handler mints subscribe-only player tokens and full-capability DM tokens. Confirm it composes with the existing `requireCampaignDM` / signed-out-visible split.
- **Fallback policy.** Keep polling as the always-available fallback indefinitely, or treat Ably as required once adopted? Lean "keep the fallback" — it is nearly free and preserves the graceful-degradation property.

---

## Sources

- Ably — [Limits](https://ably.com/docs/pricing/limits) · [Free package](https://ably.com/docs/platform/pricing/free) · [Pricing](https://ably.com/pricing) · [Pricing overview](https://ably.com/docs/platform/pricing) · [Control API: provision & configure Ably programmatically](https://ably.com/blog/introducing-control-api-provision-configure-ably-programmatically)
- PartyKit — [Preview environments](https://docs.partykit.io/guides/preview-environments/) · [CI/CD with GitHub Actions](https://docs.partykit.io/guides/setting-up-ci-cd-with-github-actions/)
- PartyKit / Cloudflare — [Cloudflare acquires PartyKit](https://blog.cloudflare.com/cloudflare-acquires-partykit/) · [cloudflare/partykit (PartyServer)](https://github.com/cloudflare/partykit) · [Deploy to your own Cloudflare account](https://docs.partykit.io/guides/deploy-to-cloudflare/) · [How PartyKit works](https://docs.partykit.io/how-partykit-works/)
- Cloudflare Durable Objects — [Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- This repo — `docs/initiative-tracker/ADR.md` (Decisions 3–5) · `apps/web/hooks/use-encounter-snapshot.ts` · `apps/web/lib/actions/encounter/events.ts` · `apps/web/app/api/encounter/[shortId]/snapshot/route.ts` · `packages/game/src/engine/{character/reduce-character,encounter/reduce-session}.ts`
