# ADR: Dungeon Map Architecture

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here.

**Status:** Draft · **Owner:** Jackson · **Date:** 2026-06-14
**Builds on:** [Initiative Tracker ADR](../initiative-tracker/ADR.md) (Campaign, the combatant overlay, the `CombatSession`) · [Real-Time Data Strategy ADR](../realtime/ADR.md) (the Ably invalidation-ping transport)
**Related:** [Dungeon Map — PRD](./PRD.md)

---

## Context

_[To be written — what's shipped (the combat tracker, its `CombatSession` owning `zones`/`adjacency`/`combatant.zoneId`, the Ably invalidation-ping layer), what the PRD asks for, and the premise this ADR adopts: the Map Instance is the single spatial truth, and **all spatially-determined state — occupancy, reveal, engagement, enchantment — lives on it**. What still stands from the PRD; what this ADR revises.]_

---

## Decision summary

| # | Decision | Choice |
| -- | -- | -- |
| 1 | **The model** | **Four entities: Map / Map Instance / Dungeon / Encounter.** A **Map** is a reusable, user-owned authored template; selecting one mints a **Map Instance** — a per-run snapshot that owns all spatial runtime. A **Dungeon** (exploration-time) and the existing **Encounter** (combat-time) are purely temporal layers over one Instance. The Instance is the single spatial truth; the temporal layers **invoke** its spatial transitions, never reimplement them. |
| 2 | **Spatial refactor (§0, prerequisite)** | Lift `zones` / `adjacency` / `combatant.zoneId` **+ engagement + enchantment** off the `CombatSession` onto the Map Instance. Migrate existing encounters' inline session-zones into a Map Instance. **Combat behavior unchanged** — this is a refactor, and the gate for everything else. |
| 3 | **Engagement & enchantment home** | **On the Map Instance**, with occupancy and reveal-state. Both are verified **combat-scoped + spatially-located** (engagement breaks on leaving a Zone; enchantment is per-Zone and ends with combat), so they prune at combat-end. Co-locating engagement with occupancy makes a **combat move a single-row write** and keeps the `move → break-engagement` rule in the same reducer as `move → reveal`. |
| 4 | **Persistence** | `maps` (user-owned template, geometry jsonb, `version`) + `map_instances` (per-run snapshot: geometry + occupancy + reveal + engagement + enchantment, `version`) + `dungeons` (`campaignId`, exploration-state jsonb, `version`). `encounters` **gains `mapInstanceId`** and **drops** inline `zones` / `adjacency`. |
| 5 | **Concurrency & atomicity** | Per-row optimistic `version` guards (reuse `version-guard`). Cross-container writes are **designed away** where the rules allow (a normal move costs no turn ⇒ Instance-only; "act" and "reveal" are separate gestures). The remaining ~4 genuinely-atomic, rare, confirm-gated lifecycle gestures (delve start, combat start, combat end, search-that-reveals) use one transaction composing per-row guards (`guardMany`). **No per-move transaction.** |
| 6 | **Reducer topology** | `reduceMapInstance` (every spatial transition: `move → reveal`, `move → break-engagement`, enchant, **and the Edit-mode geometry edits**) · `reduceDungeon` (the turn loop) · `reduceCombatSession` **repointed** to read position from the Instance instead of owning `zoneId`. Purity holds; statefulness stays in the DB and React. |
| 7 | **Combat on the dungeon** | Starting combat **places enemy combatants onto the live Instance** and layers a turn loop over it — no carved sub-graph, no copy. The whole map is in play (kiting). In exploration the DM moves tokens freely; once combat is live, occupancy is written **only through the Encounter's movement model**. Combat-end prunes enemy tokens + engagement + enchantment, persists PC positions, and advances the consumed dungeon turn. |
| 8 | **Console topology** | **One `/dungeon/[shortId]` route with an Edit ⇄ Play mode toggle, orthogonal to lifecycle status** (`draft` / `active` / `done`). Edit mode = the full builder toolset on the Instance, available **regardless of status** (in-run geometry editing ships in v1; destructive edits guarded). Map **template** authoring lives on a separate user-owned **My Maps** editor. |
| 9 | **Rendering substrate** | **React Flow (`@xyflow/react`, MIT core)**, behind a lazy `"use client"` island. Two spikes gate the commit: **token-drag-along-adjacency** and the **graph-keyboard / aria-live accessibility pass**. **Hand-rolled SVG + `d3-zoom`** is the documented escape hatch. |
| 10 | **Transport** | Reuse the **Ably invalidation-ping**. New `dungeon:{shortId}` + map-instance channels; the watch view subscribes to **both** the encounter and instance channels while combat is live. Polling stays the degraded-mode fallback. No new infra. |
| 11 | **Player view** | A **redacted Instance projection**, polled (~1.5s), signed-out-visible. Three element-states (revealed / known-exit silhouette / stripped); DM notes stripped server-side; enemy affinities hidden during combat. **Status-branched** (draft / live / ended). |

---

## The four-entity model

_[To be written — Map / Map Instance / Dungeon / Encounter; the spatial-vs-temporal split; the data-ownership table (Instance vs Dungeon vs Encounter vs character row); the PC/enemy decomposition (position + engagement → Instance; identity + vitals + non-spatial overlay → Encounter; vitals → character row).]_

---

## The spatial refactor (§0)

_[To be written — exactly what lifts off the `CombatSession` (zones/adjacency/zoneId + engagement + enchantment) and what stays (turn order, ailments, conditions, reaction, vitals); the migration of existing encounters into a Map Instance (auto-mint); the "combat behavior unchanged" gate.]_

---

## Engagement & enchantment on the Map Instance

_[To be written — the Position 2 decision with the rules grounding (§3.5: "in combat", "left the Zone → Free"; Enchantment: "in the Zone it targets", "end when combat ends"); the `engagement ⊆ same-Zone token pairs` invariant; the move → break-engagement spatial transition; prune-at-combat-end; the Enchantment Forte/one-at-a-time nuance flagged.]_

---

## Persistence & concurrency

_[To be written — the tables (maps / map_instances / dungeons / encounters.mapInstanceId); per-row versioning; the atomicity model (design-away by default + `guardMany` transaction for the ~4 rare lifecycle gestures); why the Instance is its own table (shared by Dungeon + a live Encounter).]_

---

## Reducer topology

_[To be written — reduceMapInstance / reduceDungeon / repointed reduceCombatSession; how the temporal layers invoke spatial transitions ("the move event delegates the spatial part to the Instance"); the writer-vs-home seam during combat (encounter movement model computes legality, Instance applies the write).]_

---

## Combat on the dungeon

_[To be written — enemies onto the live Instance; whole-map play; movement authority (free-drag in exploration vs the encounter movement model in combat, guided-but-overridable); combat-end cleanup (prune enemy tokens + engagement + enchantment, persist PC positions, mark the consumed dungeon turn).]_

---

## Console topology & surfaces

_[To be written — the one `/dungeon/[shortId]` route; the Edit ⇄ Play mode toggle (status vs mode as orthogonal axes; mode is DM-local ephemeral UI); in-run geometry editing in v1 with destructive-edit guards; the My Maps template editor; `/c/dungeon/[shortId]` player view; the dungeons list + create dialog on the campaign page; status-branched player view.]_

---

## Rendering substrate

_[To be written — React Flow rationale (DOM/SVG renderer ⇒ rich React nodes + an accessible tree, the two requirements that point the same way); MIT core, lazy island; the two gating spikes (token-drag-along-adjacency; the a11y graph-keyboard / aria-live pass); the SVG + d3-zoom escape hatch; the rejected options (Cytoscape — abandoned React wrapper; Sigma — WebGL fights a11y).]_

---

## Transport

_[To be written — reuse the Ably invalidation-ping; new dungeon + map-instance channels; the watch view dual-subscribes (encounter + instance) while combat is live, because a combat move now pings the Instance channel; polling fallback unchanged; channel naming via the env-namespaced server-owned helper.]_

---

## Player view: redaction & snapshot

_[To be written — the redacted Instance projection (undiscovered Zones hidden, unrevealed hidden connections invisible, DM notes stripped, enemy affinities hidden during combat); the three element-states; the polled snapshot API; status-branching; self-identification; the combat composition (own-sheet column + "Combat — Round N" signal).]_

---

## Database & rollout

_[To be written — migration inventory (additive: maps / map_instances / dungeons + encounters.mapInstanceId + the encounter-zone migration); expand/contract sequencing; the destructive vs additive split; migrate-on-deploy considerations.]_

---

## Impact on already-shipped code

_[To be written — reduceCombatSession sheds zoneId + engagement + enchantment handling; combatantSchema changes; the /combat page + EncounterSetup repoint onto a Map Instance; the watch snapshot projector reads position/engagement/enchantment from the Instance; zoneEnchantmentEffects repointed; the standalone-encounter pain-fix that falls out of §0 + Edit mode.]_

---

## Milestones & ticket-shape impact

_[To be written — map to the PRD's M0–M6, with the revision: v1 gains **in-run Instance geometry editing** (the Edit-mode toolset); structured-content editing (markers, monster spawns) stays M6. The engagement/enchantment move enlarges M0.]_

---

## Open questions remaining

_[To be written — shared/published map catalog (later); structured Zone features (M5); multi-floor dungeons (later); the Enchantment one-at-a-time cardinality (per-Bard vs global); migrate-on-deploy mechanism.]_

---

## PRD deltas (to apply)

_[To be written — the PRD lines this ADR revises: "engagement is orthogonal to position / the combatant keeps engagement" → engagement moves to the Instance; the enemy-decomposition split; "no in-dungeon authoring" → the Edit/Play mode toggle + in-run geometry editing in v1; M6 scope narrowed to structured-content editing.]_
