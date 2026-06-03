# ADR: Initiative Tracker Architecture

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Last ported from Linear: 2026-06-03.

**Status:** Accepted · **Owner:** Jackson
**Related:** [Initiative Tracker — PRD](./PRD.md) · Epics UNN-283…289

---

## Context

The PRD is finished and the project is fully ticketed. The **engine epic (UNN-283) is already built and merged**: the immutable `CombatSession` shape (UNN-291), the pure decider `reduceCombatSession(session, event) → { session, edits[] }` (UNN-292), and the duration clocks (UNN-293).

The engine was built bottom-up, before the system architecture around it was settled, on the PRD's original premise that a character's combat state stays on the character row. Designing the surrounding architecture surfaced a cleaner premise that **inverts that decision**, and this ADR adopts it:

> **Combat state is encounter-scoped and belongs to the _combatant_, not the character.** The character row keeps only what persists across encounters (HP/SP/exhaustion). Everything the rules clear at end of combat — ailments, battle conditions, party composition — lives on the combatant inside the `CombatSession`.

This collapses the dual-home of PC combat state and most of the machinery the original design needed (the PC-vs-enemy edit asymmetry, the fan-out of combat-state edits to character actions, the two-writer reconciliation, the `requireOwnerOrEncounterDM` widening). The result is a _smaller_ architecture.

**The PRD has been reconciled to this ADR (2026-06-02)** — its Architecture and Resolved Decisions sections now match. See _PRD deltas_ below.

### What still stands from the PRD

- Two pure reducers; statefulness in the DB and React, never the engine.
- The decider shape: `reduceCombatSession(session, event) → { session', edits[] }`.
- Manual starting advantage; one live encounter at a time; enemy HP/SP visible to players, affinities hidden.

---

## Decision summary

| # | Decision | Choice |
| -- | -- | -- |
| 1 | Where combat state lives | **On the combatant** (encounter overlay), uniform for PCs and enemies. Character keeps only persistent vitals (HP/SP/exhaustion). |
| 2 | Who writes combat state | **The session reducer, alone.** Combat-state edits never touch the character row. The only tracker→character writes are PC **vitals** (HP/SP). |
| 3 | Session persistence + concurrency | One `encounters` table, `session jsonb`, single `version` optimistic column via the existing `version-guard`. |
| 4 | Client/server split | Server action takes the **event** `(encounterId, event, expectedVersion)`, reduces server-side; DM client mirrors optimistically with the same reducer. |
| 5 | Player-view transport | **Polling a `getEncounterSnapshot` projection behind a swappable seam.** |
| 6 | Conditions display-only; party-scaling derived + injected | **Battle conditions / Charged/Concentrating: display-only** — no shipped code computes from them (audited), so nothing to compute, no `applyCombatOverlay`. `partyComposition` _does_ feed the shipped `resolveAttackRoll` skill display (`perPartyLineage`), so it's removed from the character but **derived from the session roster and injected into derivation** as an optional combat context (tracker scales skill cards; standalone sheet shows base). |
| 7 | Non-PC modeling | No DB table. Enemy **definition** is a `catalog \| custom` union (immutable, TS-hardcoded or inline free-entry); **mutable vitals + overlay** live on the combatant. Exact schema deferred to UNN-299. |
| 8 | Turn order & the turn loop | Minimal stored turn-state (`firstSide`, `advantage`); `draftingSide` **is derived, not stored**. Engine **guides via pure selectors, never blocks**; Fallen status is **injected** (PC vitals aren't on the session). Loop: **End Turn → resolve obligations → draft**, with `endTurn` keeping the acted actor and `advanceRound` clearing it. |
| 9 | Campaign (DM↔player boundary) | A **Campaign** (one DM) is the **prerequisite** for the tracker. **Two-level** membership: `campaign_users` (players, stable) + `characters.campaignId` (placement, churns). Auth is a single FK hop (`requireOwnerOrCampaignDM`); join via link; placement is an owner action (two-level consent). |

---

## The model: a Combatant is a _vitals source_ + an _encounter overlay_

| Combatant kind | Vitals source (persistent) | Encounter overlay (ephemeral) |
| -- | -- | -- |
| **PC** | references the **character row** — `currentHP`, `currentSP`, `exhaustion` | on the **combatant** |
| **Enemy** | **inline stat block** on the combatant — `currentHP/SP`, attributes, affinities | on the **combatant** |

The **overlay is identical for both kinds** and lives on the combatant: ailments, battle conditions (state _and_ duration), zone, engagement, turn bookkeeping, reaction flag. The _only_ thing that differs between a PC and an enemy combatant is where its vitals come from — because vitals are the only combat-adjacent state that persists once the fight ends.

### Data ownership

| State | Home | Written by |
| -- | -- | -- |
| `currentHP`, `currentSP` | **character row** | pools actions (`damage`/`heal`/…), DM-authorized in combat |
| `exhaustion` | **character row** | exhaustion action (owner-only; dungeoneering, not in-combat) |
| Ailments, battle conditions (+ durations) | **combatant** (session) | session reducer |
| Zones, adjacency, engagement, side, turn position, reaction | **combatant** / session | session reducer |
| Battle-condition modifiers (Charged/axis ×) | **not computed** — display-only flags, no shipped consumer | — |
| Party-lineage counts (`partyComposition`) | **derived** from the session roster, injected into derivation for skill display | tracker (computed, not stored) |

No value is dual-homed. That property is the whole point.

---

## Decision 1 — Combat state lives on the combatant

**Context.** Today the character row carries `ailments`, `battleConditions`, and `partyComposition` (`schema/character.ts`). All three are **encounter-scoped**: the rules clear ailments and battle conditions at end of combat, and `partyComposition` is a per-encounter ally count whose own source comment already says it "should migrate to [the tracker] as the authoritative source." They are transients persisted as if they were durable identity.

**Decision.** Move all three off the character. The combatant schema gains the overlay:

```
combatant += {
  ailments: Ailments
  battleConditions: BattleConditions   // state + the existing conditionDurations
}
```

`EnemyStatBlock` does **not** need its own ailments/conditions — the overlay is on the _combatant_, so the stat block stays purely the enemy's intrinsic data (name, vitals, attributes, affinities, notes).

**Consequence — `currentHP`/`currentSP`/`exhaustion` stay on the character.** They persist between encounters (you leave a fight at 12/30 and walk to the next room still at 12/30); they are not encounter-scoped and do not move.

---

## Decision 2 — The session reducer is the sole writer of combat state

**Context.** With combat state on the combatant, the original "reducer emits `battleConditionAxis → neutral`, shell fans it out to a character action" pipeline has nothing to fan out — the axis lives on the combatant the reducer is editing.

**Decision.** Battle-condition expiry (and every combat-state transition) **mutates the combatant directly** in the reducer's Immer draft. There is **no emitted edit for combat state at all.** This revises the merged UNN-293 behavior: `reduceTurnEvent` currently _emits_ an expiry edit; it should instead set `combatant.battleConditions[axis] = "neutral"` on the draft.

**The only tracker→character writes are PC vitals (HP/SP):**

1. **DM manually adjusts a PC's HP/SP in the panel** → the panel calls the existing pools action directly (`adjustPoolsAction`/`damage`/`heal`), DM-authorized. This does **not** go through the session reducer.
2. **A lifecycle effect changes a PC's HP** — end-of-combat restores Fallen PCs to 1 HP. The one place an `EmittedEdit` survives: it carries a **vitals** edit (a `PoolsEdit`), not a `CombatStateEdit`, tagged with a PC combatant.

So `EmittedEdit` shrinks from "the central mechanism" to "a rare vitals nudge." Its carried edit must still be an **idempotent absolute set** (so the best-effort, version-guarded character write is replay-safe), but the surface is now tiny.

**DM authorization narrows.** `requireOwnerOrCampaignDM` (Decision 9) is needed **only on the PC-vitals (pools) actions** — combat-state actions are retired (see _Retirement cascade_). The two-writer case reduces to HP/SP alone, reconciled by the existing `vitalsVersion` guard.

---

## Decision 3 — Session persistence and concurrency

One `encounters` table:

- `id` (uuid), `shortId` (nanoid, for the shareable player-view URL).
- `campaignId` (fk → campaigns; the DM is `campaign.dmUserId` — Decision 9), `name`, `status` (`draft` | `live` | `ended`).
- `session` (jsonb — the whole `CombatSession`, one nested Immer object → one blob).
- `version` (int — single optimistic token), `createdAt`, `updatedAt`.

The DM is the **sole writer** to the session, so one `version` column suffices. Every session write goes through the existing `version-guard` primitive. Storing the session as one jsonb blob mirrors how `battleConditions` is persisted today.

**Single-live-encounter guard** (UNN-302): at most one `status = 'live'` per **campaign**, enforced app-side.

The earlier "DM-vitals auth lookup" sub-decision is **resolved by Decision 9**: it's a direct FK hop (`character.campaignId → campaign.dmUserId`).

---

## Decision 4 — Client/server split: the event is the wire payload

```
applyCombatEvent(encounterId, event: CombatEvent, expectedVersion): Result<…>
```

The action receives the **event (intent)**, not a client-computed session. Server-side: `requireCampaignDM` → load session + version → `reduce` → persist `next` (version-guarded) → emit any PC-vitals edits → revalidate. The DM client runs the **same** `reduceCombatSession` optimistically via `useOptimistic`/`useTransition`.

Passing the event (not the post-state) prevents a client from persisting arbitrary session state. **Fan-out is small:** persist the session first (authoritative), then apply any PC-vitals edit best-effort with bounded retry (idempotent). A dropped vitals edit is an accepted, low-stakes eventual-consistency gap.

---

## Decision 5 — Player-view transport: polling behind a seam

The read-only player view **polls** `getEncounterSnapshot(encounterId)` every ~1.5s, behind a swappable transport seam (`useEncounterSnapshot(encounterId)` — internals can switch to SSE/push without touching the view).

Server actions + `useTransition` are request/response, and `revalidate*` only refreshes the _acting_ client. A read-only tabletop view doesn't need sub-second latency; polling ships with **zero new infra** on Vercel + Neon. SSE and third-party realtime are rejected for v1 but remain drop-in behind the seam.

**The snapshot projection** assembles the view from both homes: turn order / current actor / zone map / **overlay from the session**; **PC vitals from the character rows**; **enemy vitals from the inline stat blocks**. It **strips enemy affinities** and keeps enemy HP/SP. Reachable by `shortId` (signed-out-visible).

---

## Decision 6 — Conditions are display-only; party-scaling is derived + injected

**Context.** `deriveHydratedCharacter` reads two encounter-context inputs today — `battleConditions` and `partyComposition` — and an audit of shipped code shows they are **not the same kind of thing**:

- **Battle conditions / Charged / Concentrating** — _nothing computes from them._ There is no consumer of `battleConditions` anywhere in derivation, mechanics, or skill resolution, and no code applies the ×2.5 or the Attack/Def/Hit-Evasion modifiers. With no dice engine, that math is done by hand at the table.
- `partyComposition` — _does_ feed a live computation: the `perPartyLineage` scaler in `resolveAttackRoll` (`lib/game/combat/attack-roll.ts`), which the character sheet uses to display per-skill attack values (the **Magic Circle** and **Ailment Boost** passives).

**Decision (two parts).**

1. **Battle conditions stay display-only.** Tracked and shown as flags/reminders on the combatant; the app computes nothing from them. There is **no `applyCombatOverlay` for conditions, no condition injection.** Charged/Concentrating (UNN-294) is **track + single-use clear**: show the flag, the DM clears it after the boosted attack.
2. `partyComposition` **moves to the tracker and is injected into derivation.** It leaves the character (dropped in `0019`) and is instead **derived from the session roster** (count allied lineages on the combatant's side). The tracker passes it into `deriveHydratedCharacter` via an **optional combat-context arg** `{ partyComposition }`, so the combatant-skill display keeps the `perPartyLineage` bonus. The **standalone sheet passes no context** → base attack values. `resolveAttackRoll` is repointed to read `partyComposition` from the injected context, not the row.

This re-introduces a _minimal_ combat-context injection — but **only for `partyComposition`**, the one input with a real consumer; the battle-condition overlay injection stays eliminated.

**Audit note:** dropping `partyComposition` _without_ this repoint would silently zero the `perPartyLineage` bonus in shipped skill cards — the one place the original ADR contradicted shipped code.

---

## Decision 7 — Non-PC combatants: TS data, not a database table

**No per-enemy table.** An enemy instance is ephemeral — scoped to one `CombatSession`, its mutable state dying with the session. Even a recurring boss resets between encounters. Its durable identity is its _definition_ (max HP/SP, attributes, affinities, abilities), which is **immutable game data → hardcoded TS**, exactly like archetypes, skills, and items.

This mirrors the items pattern, whose lesson is the **split of immutable definition from mutable instance state**:

|  | Items | Enemies |
| -- | -- | -- |
| Immutable, hardcoded TS, by key | `Item` catalog | **Enemy** catalog (`lib/game/enemies/`) |
| Mutable instance state | row (`equipped`, `quantity`) | **combatant** (`currentHP/SP` + overlay) |

**Definition is a `catalog | custom` union**, because a pure key can't represent the PRD's free-entry requirement:

- `catalog` — references a hardcoded enemy by key; the entry carries structured `skillKeys` that **reuse the existing skill rendering kit**.
- `custom` — an inline free-entered block. Its abilities are a **freeform markdown field** the DM hand-writes. The tracker never _resolves_ skills (the DM adjudicates), so machine-readable enemy skills buy nothing; prose is correct.

**The structured/freeform line is load-bearing for the player view.** HP/SP, attributes, and **affinities stay structured even for custom enemies** — because the player-view snapshot must _hide enemy affinities while showing HP/SP_, and you can only redact a structured field, never a value buried in markdown. Only abilities go freeform (DM-only, never in the player projection).

**Two levels of prose** (optional, UNN-299): _definition-level abilities_ (intrinsic to the enemy type) vs _instance-level notes_ on the combatant ("_this_ goblin is enraged") — the latter belongs on the combatant, not the def.

**Not in scope:** custom enemies referencing catalog skills (promote to a catalog entry instead), and DM-_saved_ custom enemies for reuse (the deferred DB-backed bestiary).

**Exact schema is deferred to UNN-299** — this section fixes the boundaries, not the field list.

---

## Decision 8 — Turn order & the turn loop

The rules give a side-based **drafting** order, not per-combatant initiative: the side with the single highest **Agility** drafts first every round (tiebreak Luck, then a DM d20), sides alternate picking one combatant, no one acts twice until all their side has, a side that runs out lets the other **finish back-to-back**, **Fallen** are skipped, mid-round joiners act **next round**, and an ambush **opening** lets the advantaged side take all its turns before the other.

### Stance: the engine guides, it never cages

**Eligibility is advisory.** The turn logic is a set of **pure selectors** that tell the UI whose side drafts next and whom to highlight; the **events just apply the DM's choice and never hard-reject.** "Override" (UNN-307) isn't a special path — it's the absence of a rejection path.

### Minimal stored turn-state — derive the rest

```
session += { firstSide: CombatSide, advantage: "players" | "enemies" | "neutral" }
// reuse: round, currentActorId, combatant.hasActedThisRound, combatant.reactionAvailable
```

`draftingSide` **is _not_ stored — it is derived** by one pure function:

```
nextDraftingSide(session, status):
  eligible(side) = on side, not Fallen (status), not hasActedThisRound
  round 1 & advantage≠neutral → advantaged side while it has eligible, else the other
  otherwise → side with fewer acted this round; tie → firstSide; skip a side with no eligible
  neither side eligible → round complete (→ advanceRound resets hasActedThisRound, round++)
```

`firstSide` is resolved once at start from attributes (DM-overridable; the rare exact tie just prompts the DM). Because PC and enemy attributes live in different homes, the **shell** computes it and passes it on `startCombat`.

### The Fallen seam: inject status, don't store it

Fallen is vitals-derived. **Enemy** Fallen is self-contained (`currentHP ≤ 0` is on the combatant), but a **PC's** depends on its character row, which the session doesn't hold. So the selectors take `(session, status)` where `status` is the Fallen/dead set the **shell** computes (enemies from the session, PCs from character rows) — a vitals-derived status the shell injects, never stored on the session. A DM-maintained `fallen` flag was rejected (drift-prone duplicate of PC HP). **(Confirmed.)**

### Event set (extends `CombatEvent`)

```
startCombat    { advantage, firstSide }   // firstSide shell-resolved, DM-overridable
draftCombatant { combatantId }            // sets currentActor, clears Downed, refreshes reaction; never blocks
endTurn                                   // mark acted, tick durations, auto-expire conditions — keeps the actor
advanceRound                              // round++, reset hasActedThisRound (joiners become eligible), clear currentActor
addCombatant / removeCombatant            // joiners flagged for next round
+ overrides: setCurrentActor, setActed, setRound
```

### The turn loop: End Turn → resolve obligations → draft

1. **End Turn.** `endTurn` marks the actor `hasActedThisRound`, ticks _their_ durations, auto-expires any axis that hit 0 — **but keeps them as `currentActorId`** so their obligations stay addressable. Only `advanceRound` (or combat start) clears the actor. The resolve phase is **derivable, no phase field**: `currentActor && !acted` → turn active; `currentActor && acted` → End Turn pressed, resolving; `currentActorId === null` → fresh round / pre-combat.
2. **Resolve obligations.** One pure selector `endOfTurnObligations(session, status)`, scoped to the just-acted combatant, with a **two-kind split**:

   | Obligation | Kind | Engine behavior |
   | -- | -- | -- |
   | Duration hit 0 ("Attack buff expiring") | Deterministic (−1) | **Auto-applied** in `endTurn`, reported as FYI |
   | Saving throw for an ailment | Adjudicated (1d20+Lu, no in-app dice) | **Prompt** — DM rolls, records pass(clear)/fail(keep) |
   | Ailment end-of-turn effect (Burn −10% HP, Despair −5% SP + 3rd-turn KO, Sleep +10% HP) | Deterministic %, but a vitals change | **Remind** — DM applies via the panel |

   Resolved outcomes land in the owning home: **clear-ailment → session**; **HP/SP delta → vitals** (PC → character row, enemy → session).
3. **Draft.** `draftCombatant(id)` sets the actor, **clears Downed** (the one _start_-of-turn effect), and **refreshes the reaction** (normal turn only; a Follow-Up does not). Eligible highlight from `nextDraftingSide` + `eligibleToDraft` — guided, not gated.

`endTurn` remains the per-turn-effects hook (UNN-308); the obligations selector is UNN-317.

---

## Decision 9 — Campaign: the durable DM↔player boundary

**Context.** The DM-write capability needs an authorization boundary: which characters may a DM write? Tying it to a _live encounter_ makes the grant ad hoc and gives nothing to build a roster from. The durable relationship is **DM ↔ party**; an encounter is merely an instance of it. **Prerequisite for the tracker as a whole.**

**Decision.** Introduce a **Campaign**, owned by one user (the DM). Membership is modeled at **two levels** — so player identity stays stable as characters churn:

- `campaigns` — `id`, `dmUserId` (fk → user), `name`, `shortId`, timestamps.
- `campaign_users` — `(campaignId, userId)`: the **players** (the DM is `dmUserId`, not a row). _Who_ is in the campaign; stable across death/swap.
- `characters.campaignId` — nullable fk: _which characters are placed_. A character is in **at most one campaign at a time** (single FK, no many-to-many — sidesteps two DMs writing one character).
- `encounters.campaignId` — an encounter belongs to a campaign; its DM is `campaign.dmUserId`.

The two-level split makes the real cases work: **multiple characters**, **a character dies → make another** (re-point `campaignId`; the `campaign_users` row is untouched), and **join first, make a character later**.

**Authorization is a single FK hop.** `requireOwnerOrCampaignDM(characterId)`: allowed iff the viewer **owns** the character, or `character.campaignId`'s `campaign.dmUserId` **is** the viewer. Replaces `requireOwnerOrEncounterDM`, resolves Decision 3's auth-lookup, and is durable (the DM can adjust a placed PC while prepping, not only mid-fight).

**Consent is two-level, and placement is an _owner_ action.** Joining = "I'm in this group"; placing a character = "the DM may run _this_ character." A member who placed nothing exposes nothing. Crucially **the owner sets `campaignId`, never the DM.**

**Join flow (decided): a join link.** The DM shares a `/join/{token}` link; the player signs in, becomes a `campaign_users` member, and places characters. "Invite by email" is the same link delivered by email — a later additive step. (The earlier DM-adds-by-`shortId` idea is dropped — it skips the owner's consent.)

**Encounter setup sources placed characters** — `characters where campaignId = thisCampaign`, not arbitrary ids.

**Sub-decision — grant breadth (deferred):** campaign-durable vs encounter-gated. Lean **durable** — the campaign is the authority, the encounter is the context.

**Scope note.** The app's MVP scope says "no campaigns"; the tracker supersedes that for _minimal_ infrastructure only — a DM, a roster, and the authorization it grants.

---

## Cross-aggregate optimistic updates — the `edits[]` seam (added 2026-06-03)

Refines Decisions 2 & 4. Surfaced while implementing the tracker: `edits[]` is not just unexercised infra — it is the one place the tracker's optimistic story is _genuinely harder_ than the character sheet's, and it deserves a deliberate design rather than discovery when the first damage-to-PC event lands. The reference slice is the spike UNN-340.

**Closed vs open aggregate.** `reduceCharacter` derives entirely from `RawCharacterInputs` — a **closed** aggregate: everything it needs is in hand, so the sheet's `useOptimistic` frame is always complete and self-consistent. `CombatSession` is an **open** aggregate: enemy vitals live _inside_ it (the inline stat block / catalog working-HP), but **PC vitals live in the character row it only references** by `characterId`. So:

- Damaging an enemy, setting an ailment, moving a zone — **closed, fully-optimistic** session mutations; the session reducer mirrors them client-side with no external read.
- A killing blow that ends combat and **restores a Fallen PC to 1 HP** touches the **session and a character row in the same frame** — a _cross-aggregate_ update. This is exactly what `edits[]` (an `EmittedEdit` carrying a `PoolsEdit`) exists to carry, and the sheet's single-aggregate `useOptimistic` has no precedent for it.

**In v1 there is exactly one reducer-emitted cross-aggregate edit: the end-of-combat Fallen-restore** (Decision 2; UNN-320). The DM's manual PC-HP adjust goes _direct_ to the pools action, not through `edits[]`; ailment end-of-turn effects are DM-applied reminders. So the seam has a single, low-stakes v1 user — design it well against that one case.

**Idempotency: the real exposure is reconciliation, not retry.** Two distinct safety properties, often conflated:

- _Intra-action retry_ is already covered by the `version-guard` **if the bounded retry holds `expectedVersion` fixed** — the first success bumps `vitalsVersion`, so a duplicate retry stales out and cannot double-apply. A _relative_ `heal +1` is safe under this.
- _Cross-reload reconciliation of a fully-dropped edit_ is **not** covered. If the fan-out is dropped entirely (e.g. the PC's owner wrote their sheet in the same window and staled it — the accepted eventual-consistency gap), a relative `heal +1` has **no safe recovery**: you cannot tell on reload whether it was applied, so you cannot re-apply it. This is the property "idempotent absolute set" (Decision 2) was really protecting.

**Decision.** Express the Fallen-restore as an **idempotent absolute/conditional** operation — "any Fallen PC in this just-ended encounter → set HP to 1" — not a `heal +1` delta, so it is safe to **re-derive and re-apply on encounter load**. `PoolsEdit` is currently **relative-only** (`damage`/`heal`/`spendSP`/`recoverSP`), so this needs either a new absolute/conditional edit kind (e.g. `restoreFallen` / `setHP`) with its pure transition + write, or a dedicated conditional end-of-combat write. **Reconciliation rule:** on load of an `ended` encounter, recompute the Fallen set and re-apply the absolute restore (a no-op once HP ≥ 1) — turning "dropped edit = stuck at 0 HP on victory" into "self-heals on next load."

**Client optimistic view-model.** The tracker's `useOptimistic` state is a **combined** view-model `{ session, pcVitals }`: the client reducer applies both the session transition **and** `edits[]` to a local projection of PC vitals. Two PC-vitals write paths converge there — the emitted Fallen-restore _and_ the DM's manual panel pools write (UNN-309) — so the combined shape is designed once, not retrofitted.

**Sequencing.** The fan-out machinery (UNN-332, Phase 3) is currently first _exercised_ by UNN-320 (Phase 8). Validate the seam end-to-end early via a thin Fallen-restore reference slice (UNN-340) so the shell's fan-out is proven against a real emitter rather than built blind.

---

## Retirement cascade (UNN-226)

Moving combat state off the character retires recently-shipped Combat State work — footprint going _down_:

| Artifact | Fate |
| -- | -- |
| Sheet **Combat State card** (UI) | **Removed** — combat is run in the tracker. |
| Character columns `ailments`, `battleConditions`, `partyComposition` | **Dropped** — the destructive `0019` migration; deferred to cutover. `partyComposition`'s drop is coupled to the Decision 6 derivation repoint (derive-from-roster + inject) — not a pure deletion; the repoint must land first or skill cards silently lose the `perPartyLineage` bonus. |
| Actions `setAilments` / `setBattleConditions` / `setBattleConditionAxis` / `setBattleConditionFlag` / `clearCombatState` | **Retired**. |
| `writes/combat-state.ts` (ailments/conditions paths) | **Retired**; exhaustion write stays. |
| `EDIT_SURFACE_CLASS` entries for ailments/battleConditions/clearCombatState | **Removed** (dead version classes). |
| `adjustExhaustionAction` | **Stays** (exhaustion stays on character). |
| `reduceCombatStateEdit` (character slice) | **Retired**; its `BattleConditions`/`Ailments` shapes move to back the combatant overlay. |

**Migration:** drop the columns; update the seed + E2E fixtures. (UNN-290's `0017` already collapsed the `stacks` field — this is the next step.)

---

## Database & rollout plan

The retirement cascade is **destructive**, and a destructive migration must never race a playtest. The plan isolates that risk; everything else is additive.

### Migration inventory

| Migration | Kind | Effect | When it may reach prod |
| -- | -- | -- | -- |
| `0018_…_campaigns_and_encounters` | **Additive** | `CREATE TABLE campaigns`, `campaign_users`, `encounters`; `ALTER characters ADD campaignId` (nullable fk) | Anytime — empty/null & unused until written |
| `0019_…_retire_character_combat_state` | **Destructive** | `DROP COLUMN ailments, battleConditions, partyComposition` | **Cutover only** — after the tracker is trusted in a real encounter |

`drizzle-kit migrate` connects via `DATABASE_URL_UNPOOLED` (DDL over the pooler is unreliable).

### Branch topology (target)

Production is the **root** (Neon default) branch — everything branches _from_ it and resets _to_ it.

```
production         ← Neon default branch. Real data. Vercel Production → its UNPOOLED url.
├── dev            ← long-lived child; local .env.local develops here.
└── preview/<pr>   ← ephemeral child per PR (already auto-created); deleted on PR close.
```

The current default branch stays as production; the near-term hygiene change is a dedicated `dev` child so code is no longer written against prod.

### Migrate-on-deploy (planned, mechanism deferred)

Today prod migrations are manual; the e2e workflow auto-migrates _preview_ branches via the `vercel.deployment.success` dispatch. The gap is production automation. Two valid mechanisms, **decision deferred (post-Friday):**

- **(b) Deploy-success workflow** — a GitHub Action gated on the _production_ dispatch runs `db:migrate` against prod. Mirrors `e2e.yml`.
- **(a) Build-command + native Neon–Vercel integration** — migrate inside the Vercel build using the injected UNPOOLED url.

**Once automated, the safety gate flips to merge-gating:** a migration's presence on `main` _is_ its trigger. So `0018` may merge freely; `0019` **must not be merged until cutover.** Expand/contract: ship the code that stops reading the columns first; drop them later.

### The Friday guarantee

Combat-state tracking on the sheet **survives Friday regardless of tracker readiness**, because `0019` is never run until cutover:

- **Tracker ready** → ship additive bits, apply `0018`, playtest _with_ the tracker; the card stays as a fallback; `0019` deferred.
- **Tracker not ready** → playtest current prod (the card); nothing destructive shipped.

### Sequencing recommendation

1. **Now:** add the `dev` branch; repoint local `.env.local`.
2. **Through Friday:** keep prod migrations manual. Build the tracker additively.
3. **After the playtest:** land migrate-on-deploy as its own PR, validated on a preview deploy first.
4. **Cutover:** run the retirement cascade + `0019`.

---

## Impact on already-merged engine code

- `reduceTurnEvent`: (1) Expiry **mutates the combatant's `battleConditions[axis]`** instead of emitting (Decision 2). (2) `endTurn` **keeps** `currentActorId` instead of nulling it; clearing moves to `advanceRound` (Decision 8).
- `combatantSchema`: gains `ailments` + `battleConditions`. `conditionDurations` stays.
- `EnemyStatBlock`: does _not_ gain ailments/conditions. Splits into immutable definition (`catalog | custom`, +affinities, +abilities markdown) and mutable `currentHP/SP` on the combatant — UNN-299.
- `EmittedEdit`: its carried edit becomes a **vitals** edit (`PoolsEdit`) for PC combatants, not a `CombatStateEdit`.

The decider shape, purity, and durations-on-session decisions all hold; this is a re-aim, not a teardown.

---

## Impact on the ticket breakdown

| Epic / ticket | Effect of this ADR |
| -- | -- |
| UNN-325 **— Campaign (prerequisite)** | `campaigns` + `campaign_users` + `characters.campaignId`; the join-link flow; owner-placement / two-level consent. Gates UNN-297/298 and the tracker. Subs UNN-326–330. |
| UNN-296 (persistence) | `encounters` table (incl. `campaignId`), `session jsonb`, single `version`, `shortId`. |
| UNN-297 (DM auth) | `requireOwnerOrCampaignDM` on the **pools/vitals** actions; single FK hop. |
| UNN-298 (import PCs) | Source combatants from **placed characters**. |
| UNN-299 (free-entry enemies) | The `catalog \| custom` def union; `lib/game/enemies/` catalog; structured affinities + freeform `abilities`. |
| UNN-309…312 (panel) | PC vitals → pools action; **all** combat state (PC + enemy) → `CombatEvent`. |
| UNN-303 / UNN-306 | `startCombat { advantage, firstSide }`; `advanceRound` clears the actor + resets acted; mid-round joiners. |
| UNN-304 | `draftingSide` is **derived** via `nextDraftingSide`. |
| UNN-305 | Selectors take an **injected** Fallen `status`. |
| UNN-307 | No rejection path — override is the default. |
| UNN-308 | The impure shell (UNN-332) + PC-vitals fan-out; `endTurn` is the hook. |
| UNN-317 | `endOfTurnObligations` selector, auto-vs-prompt split. |
| UNN-321 (transport ADR) | **Done — superseded by Decision 5.** |
| UNN-322/323 | Build against `getEncounterSnapshot` + the polling hook. |
| **New tickets** | UNN-331 engine re-aim · UNN-332 impure shell · UNN-333 retire UNN-226 + `0019` · UNN-334 `partyComposition` derive-from-roster + inject (gates the `0019` `partyComposition` drop) · UNN-340 cross-aggregate `edits[]` seam spike · plus Campaign surfaces/lifecycle (UNN-329/330). |

---

## User journeys, surfaces & lifecycle

Tracing the **DM and player journeys** surfaces a layer the decisions don't cover: campaign _surfaces_ and _lifecycle_. Additive, but required for a coherent v1.

### New app surfaces (none exist today)

- **My Campaigns** — campaigns you run (DM) or are in (player); create CTA.
- **Campaign detail / manage** (DM) — copy/regenerate the join link; the roster (`campaign_users` + placed characters, incl. "joined, nothing placed"); remove a player; start/resume an encounter; surface a **live encounter** to watch.
- **DM combat console** (`/combat/[encounterId]`) vs **player watch view** (by `shortId`, signed-out-visible) — two routes, two visibility models.

### Flows the journeys require

- **Join-link round-trip** — a signed-out / new player must return to the join page **after** OAuth.
- **Placement** (owner action) — place an existing character, **or** create one for the campaign, **or** **move** one already placed elsewhere (single-campaign invariant). The UI makes the **consent** legible.
- **Encounter build** picks a **subset** of placed characters (+ catalog / free-entered enemies).

### Lifecycle rulings (decided)

- **Leave / kick** — removing a `campaign_users` member **nulls their characters' `campaignId`**; player-initiated leave is symmetric.
- **Campaign deletion** — cascade-delete encounters + `campaign_users`; **null `characters.campaignId`**.
- **Live-encounter lock** — a character that is a combatant in a `live` encounter **cannot be deleted or unplaced** until the encounter ends or the DM removes the combatant (otherwise unplacing revokes the DM's write access mid-fight).

### Edge cases (noted, deferred)

- **Stranger with the link** → mitigated by **kick + token rotation**.
- **DM-as-player (GMPC)** → falls out fine (owner _and_ DM).
- **No "combat started" notification** → Discord covers v1; campaign-page polling later.
- **Co-DM** → out of scope (single `dmUserId`).

---

## PRD deltas (applied 2026-06-02)

The PRD has been updated to match this ADR:

- **Architecture §** — all combat state lives on the combatant; the character is durationless _and_ condition-less; the DM writes only vitals.
- **Resolved Decisions §** — combat state on the combatant; DM write authorization widens the **vitals** actions only, via `requireOwnerOrCampaignDM`.
- **DM↔encounter relationship** → **DM↔campaign**.
- **Combat conditions are display-only** (Decision 6) — the app computes nothing from them.
- **Non-PC modeling** (Decision 7) — enemies are a `catalog | custom` def union.
- **Campaign concept + surfaces** (Decision 9 + _User journeys_).
- **Scope** — superseded for the _minimal_ campaign infrastructure.

---

## Open questions remaining

- **Invite delivery** (Decision 9): out-of-band join link now; email/inbox later.
- **DM grant breadth** (Decision 9): campaign-durable vs encounter-gated. Lean durable.
- **PC-vitals fan-out retry bound**: 3 then soft-warn is a starting value.
- **Post-combat hook** (PRD §8): Fallen-restore + close-out; the Spoils flow stays a hook.
