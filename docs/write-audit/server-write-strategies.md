# Server-Side Write Strategies — 2026-06-21

A spike survey of every strategy the app uses to **persist data on the server**,
produced on the `feature/dungeons` epic branch (which introduces several new write
paths). Companion to [frontend-write-strategies.md](frontend-write-strategies.md),
which covers how the client *triggers* these writes.

The app uses **one foundational write pattern** with **four specialized variants**
layered on top, plus a set of shared concurrency/realtime primitives they all draw
from. Every variant follows the same skeleton — *parse → authorize → load →
transform → version-guarded persist → revalidate + realtime ping* — and they differ
along three axes: **what crosses the wire** (computed state vs. typed event vs. whole
blob), **how many rows the write touches atomically** (one vs. many), and **who is
allowed to write** (owner vs. campaign DM vs. nobody).

## The five strategies at a glance

| # | Strategy | Wire payload | Concurrency primitive | Rows | Writer | Where |
|---|----------|--------------|----------------------|------|--------|-------|
| 1 | **Character owner-mode** (canonical) | per-field value, **server merges** | `version-guard` (per-class CAS) | 1 | character owner | `lib/actions/*`, `lib/db/writes/*` |
| 2 | **Encounter / live combat** | typed `CombatEvent`, server reduces | single-row `version-guard` + `guardMany` for composite | 1–2 | campaign DM | `lib/actions/encounter/events.ts` |
| 3 | **Dungeon delve** *(new)* | typed event **or** column flip | **`guardMany`** (multi-row) + single-row | 2 (dungeon + map-instance) | campaign DM | `lib/actions/dungeon/*` |
| 4 | **Map authoring** *(new)* | **whole `geometry` blob**, debounced | single-row `bumpMapVersionGuarded` | 1 | map owner | `lib/actions/save-map.ts` |
| 5 | **Map-instance** *(new)* | typed `MapInstanceEvent`, server reduces | single-row, composes into `guardMany` | 1 (often atomic w/ #2/#3) | campaign DM | `lib/actions/encounter/events.ts` |

## Shared backbone (used by all five)

- **Optimistic concurrency via integer version columns + compare-and-swap.** Every
  write is `UPDATE … SET <patch>, version = version + 1 WHERE id = ? AND version =
  expectedVersion`. Zero affected rows → disambiguate `stale` (row moved on) vs
  `not-found` (row deleted). The client carries a monotonic `expectedVersion` and
  gets the new token back. Character writes refine this into **four independent
  per-class tokens** (`identity / vitals / inventory / progression`,
  `apps/web/lib/db/version-classes.ts:24-25`) so unrelated edits don't false-conflict;
  encounters/dungeons/maps each use a single `version` column, deliberately *not*
  folded into the character primitive.
- **Pure engine reducers do the transform.** The server is a thin impure shell; the
  actual state transition is a pure, deterministic, exhaustive-`switch`-no-`default`
  "decider" in `packages/game` (`reduceCharacter`, `reduceCombatSession`,
  `reduceDungeon`, `reduceMapInstance`, `reduceMapGeometry`) — the *same* function the
  client runs optimistically, so the optimistic frame and the persisted result can't
  drift.
- **Authorize-before-load**, always, at the action boundary (`requireOwner` /
  `requireCampaignDM` / `requireMapOwner`); the db-write layer is auth-free.
- **Realtime is advisory-only (UNN-370/372).** Pings carry *version metadata, never
  domain data*, fired from the write choke point via Next `after()`
  (`apps/web/lib/realtime/publish.ts:65-89`). Subscribers refetch through existing
  authed/redacting read paths, so realtime can never weaken server-side redaction. The
  whole Ably layer no-ops without `ABLY_API_KEY`, degrading to BroadcastChannel
  (cross-tab) + ~1.5s polling.

---

## 1. Character owner-mode (the canonical pattern)

**One-line:** per-write-class optimistic-concurrency Server Actions — every owner edit
dispatches a thin `"use server"` action that parses → authorizes → persists through a
single version-guarded `UPDATE` on a per-class integer token, then revalidates and
fires an advisory ping.

**Path (worked example — battle-condition flag toggle):**

1. Client `useCharacterWrite().write({ edit, surface, action })` —
   `apps/web/hooks/use-character.tsx:239-274` (opens a local `useTransition`, applies
   optimistic `reduceCharacter` frame).
2. Dispatch wrapper resolves surface→class, calls `action(versionRef.current)` —
   `apps/web/hooks/dispatch-character-write.ts:44-81`.
3. Server Action `setBattleConditionFlagAction` —
   `apps/web/lib/actions/combat-state.ts:101-119`.
4. Zod validation (`SetBattleConditionFlagSchema`, extends `characterMutationBase` =
   `{ characterId, expectedVersion }`) — `combat-state.schema.ts`,
   `character-mutation.schema.ts:24-27`.
5. `requireOwner(characterId)` — loads the row, compares `ownerId`, trips Next
   `forbidden()` (403) on mismatch — `apps/web/lib/auth/viewer-role.ts`.
6. DB wrapper reads current `battleConditions`, merges the single flag server-side —
   `apps/web/lib/db/writes/combat-state.ts:105-119`.
7. Concurrency: `bumpCharacterVersionGuarded` —
   `apps/web/lib/db/writes/version-guard.ts:84-105`.
8. `revalidateCharacter` (`revalidatePath('/c/{shortId}')`) —
   `apps/web/lib/actions/revalidate.ts:20-28`.
9. `publishCharacterPing` fired *inside the guard* — `version-guard.ts:102`.

**Concurrency:** four independent integer columns; each write gated on exactly one
class. CAS in one `SET`; `.returning()` yields the new version. Per-class scoping is
load-bearing — a debounced notes save (identity) isn't false-staled by a vitals blur.
The one cross-class write is `leveling.applyLevelUp` (vitals + progression), which
conditions on and bumps **both** tokens via an `expectedVersions` pair.

**The "per-field action, server merges" rule (UNN-226).** When several controls write
one shared jsonb column (`battleConditions`), the wrong design is "each control
composes the full post-state from `useOptimistic` in a closure and POSTs it" — back-to-
back clicks read a stale outer-scope value and the second write clobbers the first. The
fix: **one action per field** (`setBattleConditionAxisAction`,
`setBattleConditionFlagAction`), and **the server reads the row and merges**
(`combat-state.ts` / `writes/combat-state.ts`). This is what makes a legitimate
same-class race non-destructive.

**Key files:** `apps/web/lib/actions/README.md` (the pattern doc),
`version-guard.ts`, `version-classes.ts`, `combat-state.ts`(+`.schema`),
`writes/combat-state.ts`, `use-character.tsx`, `dispatch-character-write.ts`,
`character-version-sync.ts`, `viewer-role.ts`.

---

## 2. Encounter / live combat

**One-line:** event-sourced as a *protocol*, not a log — the client sends a typed
`CombatEvent`, the server reduces it onto the loaded `session` jsonb and persists the
whole snapshot (no event history retained).

**Path:** client dispatches an event via a serialized queue
(`hooks/use-queued-write.ts:68-98`) → `applyCombatEvent`
(`apps/web/lib/actions/encounter/events.ts:77-128`) → `ApplyCombatEventSchema.safeParse`
→ `requireCampaignDM` (authorize-before-load, `:86-88`) → `loadEncounterRowById`
(`:103`) → `reduceCombatSession(session, event)` (`:119`, engine
`reduce-session.ts:38-83`) → version-guarded `saveEncounterSession`
(`writes/encounter.ts:82-141`) → `publishEncounterPing` + `revalidateEncounter`
(`:123-127`).

**Event union:** `CombatEvent`
(`packages/game/src/foundation/encounter/session-event.ts:252-260`) — a discriminated
union (turn / round / battle-condition / ailment / counter / action-economy / enemy-
vitals / override) validated by a Zod `combatEventSchema` kept in compile-time lockstep
with the hand-written union (`Equals` assertion, `:345-349`).

**Single-writer concurrency:** the DM is the sole writer, so one `version` column
guards everything. Composite gestures (`addCombatant` / `removeCombatant`,
`startCombat`) fold the session save + map-instance write (or `draft→live` flip) into
**one `guardMany` transaction** guarded on both versions (`events.ts:178-292`).

**Read path for watchers:** redacted player snapshot
(`load-encounter-snapshot.ts`, projector `player-snapshot.ts:228-314` — enemy arm has
*no* `attributes`/`affinities` keys at all, structural redaction), served from the
public `app/api/encounter/[shortId]/snapshot/route.ts`, polled ~1.5s.

> **Branch correction.** On `feature/dungeons` the player-scoped overlay write
> (`applyOwnCombatEvent` / `own-events.ts` / `use-own-combat-event`) was **deleted**
> (UNN-467), not merged into `events.ts`. Combat conditions are now **DM-only**;
> players see them read-only. The `PLAYER_OVERLAY_EVENT_KINDS` /
> `isPlayerOverlayEvent` / `PlayerOverlayEvent` helpers in `session-event.ts:360-382`
> are now **dead code** — a cleanup candidate.

---

## 3. Dungeon delve *(new — the epic's headline)*

**One-line:** the exploration-time peer of the combat write — event-sourced like
encounters, but **split across two rows** with a **new multi-row transactional
concurrency primitive (`guardMany`)**.

**The two-row split.** A delve's state is deliberately split: the `dungeon` row owns
*only* the temporal turn loop (`turnCounter`, `actedCharacterIds`, `reminderSettings`,
`foundation/dungeon/state.ts:85-92`) and **owns no geography**; all geography /
occupancy / fog lives on a shared `mapInstance` row. The console therefore holds two
optimistic containers and two version tokens, and `applyDungeonEvent` routes each event
to the correct row (`apps/web/lib/actions/dungeon/events.ts:76-89`).

**Path (turn-loop event):** `dispatchDungeonEvent`
(`components/dungeon/explore/dispatch-event.ts:67-72`) → `applyDungeonEvent`
(`actions/dungeon/events.ts:60`) → `ApplyDungeonEventSchema.safeParse`
(union of `dungeonEventSchema | mapInstanceEventSchema`, `events.schema.ts:24-29`) →
`requireCampaignDM` (`:69-71`) → `loadDungeonRowById` (`:73`) →
`reduceDungeon(state, event)` (`:77`) → version-guarded `saveDungeonState` (`:78`,
`writes/dungeon.ts:91-110`) → `publishDungeonPing` + `revalidateDungeon` (`:81-85`).
Spatial events take `applySpatialEvent` (`:101`) against the map-instance row instead.

**`guardMany` vs `version-guard`** (`apps/web/lib/db/writes/guard-many.ts:36`). The
single-row guards report conflict by **returning** `err`, not throwing — but the Neon
driver only rolls back on a *throw*, so a guard that returns `err` after an earlier
guard already wrote would otherwise commit the earlier write. `guardMany` composes
several guards in one transaction; if the body returns any `err` it throws an internal
`GuardManyRollback` sentinel to force rollback, then catches it and surfaces the same
`err` verbatim (`:42-50`). The body shares one `tx` executor so all composed guards see
one snapshot. The single-row guard wasn't enough because delve-start / search-reveal /
combat-start each touch **two rows**, and a partial commit would strand state.

**Write sub-strategies within the dungeon family:**

| Sub-strategy | File | Pattern | Rows |
|---|---|---|---|
| Turn-loop event (`markActed`/`advanceTurn`) | `events.ts:76` | reduce → single-row guard | dungeon |
| Spatial event (move/reveal/hide/unlock) | `events.ts:101` | reduce instance → single-row guard, separate `expectedInstanceVersion` | instance |
| `delve-start` | `delve-start.ts:47` | **`guardMany`**: snapshot geometry → place tokens → reveal start zones → `draft→active` | dungeon + instance |
| search-that-reveals | `search-reveal.ts:35` | **`guardMany`**: `markActed` + reveal atomically | dungeon + instance |
| status (`active→done`, one-active-delve guard) | `status.ts:42` | single-row column flip | dungeon |
| reminders | `reminders.ts:30,55` | **per-field UNN-226 merge** | dungeon |
| create | `create.ts:43` | plain `db.transaction` insert (no guard), shortId-collision retry | dungeon + instance |
| version (read) | `version.ts:23` | ungated read for the stale-retry path | — |

The reducer event union itself is tiny (`markActed`, `advanceTurn`,
`foundation/dungeon/dungeon-event.ts:28-31`); status / reminders / search-reveal /
delve-start are deliberately kept *out* of the union and handled as dedicated actions /
column flips.

**Dungeon↔combat coupling.** `startDungeonEncounterAction`
(`actions/encounter/start-dungeon-encounter.ts:56`) runs combat **on the delve's own
map instance — no copy**. Each PC reuses its `characterId` as combatant id, so its
exploration token already on the instance *is* its combat token; only enemies get fresh
UUIDs. The write is a `guardMany` folding enemy tokens onto the instance +
`createEncounter` (status `live`, on the same `mapInstanceId`) atomically (`:130-152`).
The link is **discovered, not stored** — `getDungeonSnapshot` derives it by querying a
live encounter sharing the instance (`load-dungeon-snapshot.ts:91,121-139`). PC tokens
persist back into exploration when the fight ends.

---

## 4. Map authoring *(new)*

**One-line:** debounced **whole-document** optimistic-concurrency autosave — the
`/stage/maps/{shortId}` editor reduces edits client-side and POSTs the *entire* `geometry`
blob to a version-guarded action. No event crosses the wire (a map template has a
single owner, so no trust boundary).

**Path:** canvas edit → `reduceMapGeometry` client-side → emit whole blob
(`apps/web/components/shared/canvas/map-canvas.tsx`) → debounced + serialized through one
`saveQueueRef`/`versionRef` (`hooks/use-map-autosave.ts`) → `saveMapAction`
(`apps/web/lib/actions/save-map.ts:25`, `SaveMapSchema` is a discriminated union of
name/geometry) → `requireMapOwner` (`:32`) → `saveMapGeometry`
(`writes/map.ts:64`) → `bumpMapVersionGuarded` (`:103`, replaces the whole `geometry`
column). **No `revalidatePath`** — the editor renders its optimistic value. Self-heals
on the next edit; geometry does **not** hard-revert on failure.

`createMapAction` only requires sign-in (you own what you create);
`deleteMapAction` is the only map write that revalidates (`/stage/maps`) and is a plain
DELETE with no live-encounter lock (the FK is `set null`).

---

## 5. Map-instance *(new)*

**One-line:** the live-session counterpart to #4 — the *same* geometry vocabulary, but
now untrusted multi-actor runtime state, so it **does** event-source.

**Path:** the DM canvas dispatches a `MapInstanceEvent`
(`foundation/encounter/map-instance-event.ts:175`, the `editGeometry` member wraps a
`MapGeometryEvent`) through the shared encounter action `applyCombatEvent`; the
`isMapInstanceEvent` branch routes to `applySpatialEvent`
(`actions/encounter/events.ts:137-164`) → `reduceMapInstance(state, event)`
(`engine/encounter/reduce-map-instance.ts:42`; the `editGeometry` arm delegates to
`reduceMapGeometry` then layers instance-only cleanup — blocks occupied-zone deletes,
prunes fog/enchantment) → version-guarded `saveMapInstanceState` on
`expectedInstanceVersion`, fires a `mapInstance`-kind ping (UNN-468). Composes into
`guardMany` transactions with the encounter/dungeon row when a gesture must be atomic.

**Same pure core, two hosts.** `reduceMapGeometry` is used **directly** by the template
editor (no `newId`/`GameData` injection needed — the canvas mints ids itself) and by
**delegation** from `reduceMapInstance` in the live instance. The cleanest illustration
of the project's "split write strategy by trust boundary" principle: whole-blob save
for templates vs. event-dispatch for live instances, in **one `MapCanvas` component**.

**Geometry validation, two tiers, both pure:** hard validity is kept by the reducer
(self-loop / unknown-endpoint / duplicate-edge no-ops, cascade on zone delete,
`reduce-map-geometry.ts`); soft non-blocking warnings (`disconnectedZoneIds`,
`duplicateZoneNames`, `engine/map/geometry-warnings.ts`) render client-side and never
gate the save.

---

## The throughline

The epic's real architectural addition is **multi-row atomic writes.** Strategies 1–2
were single-row optimistic-concurrency writes; the dungeon epic introduces state that
legitimately spans rows (dungeon + map-instance + encounter), and `guardMany` is the
primitive that makes those cross-row gestures atomic while preserving the existing
return-`err`-don't-throw guard convention. Maps add the second new idea: **the same
mutation vocabulary gets two different wire strategies depending on whether it crosses a
trust boundary.**

## Cleanup candidates surfaced during the survey

- **Dead `PLAYER_OVERLAY_EVENT_KINDS` union** in `session-event.ts` after UNN-467
  deleted the player overlay write.
- **Asymmetric stale-retry in the dungeon console** — it can refetch the dungeon
  version but has no instance-version refetch action, so an instance-stale spatial
  conflict toasts instead of auto-recovering (already noted as deferred to UNN-468 in
  `use-dungeon-console.ts:80-84`).
