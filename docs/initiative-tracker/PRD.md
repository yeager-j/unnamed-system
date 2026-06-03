# Initiative Tracker — PRD

> **Canonical source.** This document lives in the repo and is the source of truth. A stub in Linear links here. Last ported from Linear: 2026-06-03.

**Status:** Draft · **Owner:** Jackson · Revised to match the **Initiative Tracker Architecture ADR** ([ADR.md](./ADR.md))

## Overview

The Initiative Tracker is the DM's live console for running a combat encounter in the Persona System. It manages turn order, surfaces each combatant's state, and tracks the combat geometry the rules introduce that nothing else owns yet — **Zones and Engagement**. The system's turn structure is unusual: there is no fixed per-combatant initiative. Instead, sides alternate drafting which combatant acts next, and out-of-turn actions (Follow-Ups, Shifts, All-Out Attacks) can interrupt the sequence. The tracker exists to make that flow fast and unambiguous at the table.

This is a prep-and-run tool. A DM builds an encounter ahead of time, then drives it live while players watch a shared, read-only view. Encounters run within a **Campaign** — a DM and a roster of players' characters.

## Goals

- Make the side-based drafting turn order trivial to run, with the rules enforced as a guide but never as a cage.
- Give the DM a single screen for every combatant's live state — HP/SP, ailments, battle conditions, Zone, and engagement.
- Model Zones and Engagement, the net-new domain concepts the existing engine does not cover.
- Own the turn/combat loop the engine lacks, and drive per-turn effects (saving throws, condition expiry) from it without making the engine stateful.
- Prompt the DM at the right moments for the rules that are easy to forget (saving throws, Follow-Ups, All-Out Attacks, condition durations).
- Let players follow along on a synced, read-only view without the DM having to narrate bookkeeping.

## Non-Goals (v1)

- A reusable **DM-saved** enemy bestiary. Enemies come from a hardcoded-TS catalog or are free-entered per encounter; _saving_ custom stat blocks to a database for reuse is deferred.
- Automating the full Follow-Up / Shift / All-Out / Synthesis sequence. v1 only prompts and reminds.
- Players editing their own state _in the tracker_. The DM drives everything; the player view is read-only. (Players still edit their own character sheet normally — e.g. the end-of-combat self-heal to 1 HP happens there.)
- Automatic resolution of attack rolls, damage, affinities, or ailment infliction. The DM adjudicates; the tracker records outcomes.
- **Computing anything from battle conditions.** There is no dice engine, so condition math (Charged/Concentrating's 2.5×, Attack/Def/Hit-Evasion modifiers, party-lineage scalers) is done by hand at the table; the app only _tracks and displays_ conditions.
- Automatic ambush rolls. The DM declares the encounter's starting advantage (see Starting Combat).
- More than one live encounter per campaign at a time.
- Multiple DMs / co-DM per campaign. One DM per campaign.
- A dice roller (dice are physical or the existing app provides one).

## Users & Context

The primary user is the **DM**, running the tracker on a laptop or tablet at the table. The secondary audience is **players**, who see a real-time read-only view (their own devices or a shared screen) showing turn order, Zone layout, and visible combatant state. A **Campaign** groups one DM with a roster of players' characters; encounters run within a campaign. Sessions are cooperative and in-person or remote; the shared view must stay in sync with the DM's actions without manual refresh.

## Architecture & Integration

The tracker is a **dedicated set of routes inside the existing character sheet Next.js app** — a DM combat console (`/combat/[encounterId]`), a read-only player view (by `shortId`), and the campaign surfaces below — not a section of the character sheet and not a separate site. It imports the game engine directly and reuses the app's auth and stored characters. The app is Next.js 16 / React 19, using server actions and `useTransition`. The full technical design is the **Initiative Tracker Architecture ADR** ([ADR.md](./ADR.md)); this section summarizes the load-bearing decisions.

**Two pure engines, one source of statefulness.** The existing game engine is a set of pure reducers over immutable character state; statefulness lives in the database and React, never in the engine. The tracker holds to the same discipline: a **second pure reducer over an immutable** `CombatSession` — `(session, event) → session'`. Rounds, the draft, the current actor, durations, Zones, engagement, side membership, turn position — and each combatant's combat state — are all data fields on the `CombatSession`. The tracker is the _interpreter of time_; the game engine is the _evaluator of state changes_.

**Combat state lives on the combatant, not the character.** Ailments, battle conditions (state _and_ duration), Zone, engagement, and turn bookkeeping are encounter-scoped — the rules clear them when combat ends — so they live on the combatant inside the `CombatSession`, not on the character row. The character keeps only what _persists_ between encounters: current **HP/SP** and **Exhaustion**. A combatant is therefore a **vitals source + an encounter overlay**: a PC combatant references its character row for HP/SP and carries the overlay; an enemy combatant carries inline HP/SP _and_ the overlay. The overlay is identical for both. _(This supersedes the earlier "durations live on the session, the character keeps `battleConditions`" plan — all combat state moves to the combatant, eliminating the dual-home.)_

**The session reducer is the sole writer of combat state.** Battle-condition expiry and every other combat-state transition mutate the combatant directly in the reducer's draft — there is no fan-out of combat-state edits to character actions. The _only_ tracker→character write is the DM adjusting a PC's HP in the panel (via the existing pools actions). The end-of-combat Fallen→1HP restore is a **player self-heal** on the player's own sheet, not a tracker write — the reducer emits nothing.

**The app tracks combat conditions; it does not compute with them.** With no dice engine, condition math is manual at the table. Battle conditions and Charged/Concentrating are tracked and displayed as flags/reminders; the app computes nothing from them, and base character derivation stays combat-free.

**Enemies are TS data, not a database table.** An enemy instance is ephemeral — it dies with the session, and even a recurring boss resets between encounters — so there is no per-enemy table; its mutable state lives on the combatant. Its _definition_ is immutable game data: a `catalog | custom` union — a hardcoded-TS catalog entry (referenced by key, like items) **or** a free-entered inline stat block. Catalog enemies reference Skills by key; free-entered enemies carry a freeform markdown abilities field the DM runs by hand. HP/SP, attributes, and affinities stay structured (affinities specifically so the player view can hide them).

**Campaigns: the DM↔player boundary.** A **Campaign** is owned by one user (the DM) and is the prerequisite for the tracker. Membership is two-level: `campaign_users` records _who_ is in the campaign (players; stable across character death/swap), and a nullable `characters.campaignId` records _which characters are placed_ in it (a character is in at most one campaign at a time). An encounter belongs to a campaign. Authorization for DM writes is durable and campaign-scoped — `requireOwnerOrCampaignDM(characterId)`: the viewer may write iff they own the character or are the DM of the campaign it's placed in (a single FK hop, `characters.campaignId → campaigns.dmUserId`). A placed character thus has two legitimate writers — the owning player on their sheet and the campaign DM in the tracker — reconciled by the existing `vitalsVersion` guard. **Placement is an owner action** (the player places their own character — that is the consent; the DM can't reach a character into their campaign). Players join via a shareable **join link**. _(Supersedes the earlier per-encounter `requireOwnerOrEncounterDM`.)_

**Real-time player view: polling.** The shared player view polls a read-only `getEncounterSnapshot(encounterId)` projection (~1.5s) behind a swappable transport seam — zero new infra on Vercel + Neon. SSE / push remain drop-in later. _(Settles the transport question the earlier draft left open.)_

## Combat Model Recap

For reference, the mechanics the tracker must respect:

**Turn order.** The side with the single **highest Agility** acts first every round. Tiebreak: highest **Luck**; if still tied, DM rolls d20 (11+ = players first). Within a round, sides alternate drafting one combatant at a time. A combatant cannot take a second turn until **every member of their side has acted**. If one side runs out of combatants first, the other finishes its remaining turns back-to-back. **Fallen** combatants are skipped. Combatants who join mid-round act at the **start of the next round**.

**Starting advantage.** On a successful ambush, the ambushing side takes **all** of its turns (still drafted among themselves) before the other side acts; normal alternating order resumes after both sides have had a full round. In this tool the DM declares the outcome directly rather than rolling (see Starting Combat).

**Out-of-turn actions.** Downing an enemy (via weakness or Critical Hit) grants a **Follow-Up** — one extra Standard Action, no Move, no Reaction. A Follow-Up can be **Shifted** to an ailment-free ally; no ally repeats within a single Shift chain. When all enemies are Downed, the active side may instead trigger an **All-Out Attack** or a **Synthesis Skill** (both require participants to be healthy — no ailment, not Fallen).

**Actions per turn.** One Move + one Standard Action + one Reaction. The Reaction refreshes at the **start of a normal turn**, not on a Follow-Up.

**Ailments.** One at a time (most recent wins). At the end of each turn, the afflicted rolls a saving throw (1d20 + Lu > 10) to clear it; all ailments clear after combat. **Downed** is the exception: it clears at the start of the character's next turn and can coexist with one other ailment. A character with an ailment cannot receive a Shift or join an All-Out Attack.

**Battle conditions.** Attack, Defense, and Hit/Evasion are each neutral, raised, or lowered; they don't stack — a repeated buff **extends the duration** instead. **Charged** and **Concentrating** multiply the next Physical or Magical attack by 2.5× and are single-use. Durations decrement at the end of the **target's** turn.

**Fallen & Dead.** A PC at 0 HP is **Fallen** (turns skipped, ignored by enemies, recovers to 1 HP on victory). If the whole party is Fallen, they are Dead. NPCs at 0 HP are dead (or unconscious in a declared non-lethal encounter).

**Zones.** The battlefield is divided into ~30 ft Zones with defined adjacency. Each combatant is in a Zone and is either **Engaged** (locked with specific creatures) or **Free**.

## Functional Requirements

### 0. Campaign setup (prerequisite)

Before running combat, a DM creates a **Campaign** and invites players with a shareable **join link**. A player clicking the link signs in (returning to the join page after auth), becomes a member, and **places** one or more of their characters into the campaign — placement is the consent that authorizes the DM to update that character's vitals in combat. A player may also join first and create a character later. The DM's **campaign page** shows the roster (players and their placed characters), lets the DM copy/regenerate the join link and remove a player, and is where encounters are created, resumed, and surfaced live for players to watch. A character is in at most one campaign at a time; removing a player or deleting the campaign unplaces their characters, and a character that is a combatant in a live encounter cannot be deleted or unplaced until the encounter ends. New app surfaces: **My Campaigns** and a **campaign manage** page.

### 1. Encounter setup (prep)

The DM creates and saves an encounter **within a campaign** and resumes it later. Setup includes adding PCs from the campaign's **placed characters**, adding enemy/NPC combatants — either from the **hardcoded enemy catalog** or **free-entered** (name, HP/SP, the four Attributes, affinities, and a freeform abilities/notes field) — assigning each combatant to a side, and laying out the Zones with their adjacency and each combatant's starting Zone and engagement. An encounter includes a chosen **subset** of placed characters, not necessarily the whole roster. A saved encounter can be opened and run live, and its in-progress state persists if a session is interrupted. Only one encounter is live per campaign at a time.

### 2. Starting combat

The tracker does **not** roll or compute ambushes. When combat begins, the DM declares one of three starting states: **Player Advantage**, **Enemy Advantage**, or **Neutral**. On Player or Enemy Advantage, that side takes all of its opening turns (drafted among themselves) before the other side acts, then normal alternating order resumes. On Neutral, the standard turn order applies from round one (first side per the highest-Agility order in the turn engine, overridable by the DM).

### 3. Turn-order engine (guided, overridable)

The tracker maintains the round and the draft. At each step it **highlights the valid combatants** the active side may pick next, enforcing the "no second turn until all allies have acted" and back-to-back-finish rules, and automatically skipping Fallen combatants. The DM picks who acts; the tracker advances. Crucially, the DM can **override** at any point — manually reorder, insert, remove, or re-pick a combatant — and the engine resumes guiding from the new state. Eligibility is _advisory_: the engine guides via pure selectors and never hard-blocks the DM's choice. New combatants added mid-round are queued for the next round. The current actor, the round number, and who has yet to act this round are always visible. This loop is the source of the turn events that drive per-turn effects (end-of-turn saving-throw prompts, duration decrements); the `CombatSession` reducer applies them directly to the combatant. PC **vitals** are never emitted by the reducer — the DM adjusts them via the panel pools action, and the end-of-combat Fallen-restore is a player self-heal.

### 4. Combatant state panel

For each combatant the tracker surfaces its combat state and lets the DM adjust it: current/max **HP and SP** (with 0 HP flagging Fallen/dead per side), the current **ailment** plus Downed status (including Downed coexisting with another ailment), and **battle conditions** (Attack/Def/Hit-Evasion raised/lowered and Charged/Concentrating) with their remaining **durations**. All of this combat state lives on the combatant in the `CombatSession`; **PC vitals (HP/SP) are the exception** — they live on the character row and are written through the existing (campaign-DM-authorized) pools actions, so the player's own sheet updates live. Battle conditions are **display-only reminders**: the app shows them but computes nothing from them. The panel also tracks a single **Reaction used / available** flag — there is only one kind of Reaction — refreshing it at the start of each normal turn but not on a Follow-Up.

### 5. Zones & engagement (net-new)

The tracker renders the Zone layout and adjacency and shows which combatants occupy each Zone and their **Engaged/Free** status, including which creatures a given combatant is Engaged with. The DM can move combatants between Zones and set or clear engagement. This, together with the `CombatSession` reducer and duration clocks, is the primary new build; the rest reuses or surfaces the existing engine.

### 6. Rules prompts & reminders

At the end of each turn, the tracker resolves the just-acted combatant's obligations: **duration decrements** are applied automatically and reported, while **saving throws** (for any afflicted combatant) and ailment end-of-turn effects are **prompts** the DM rolls and records. When the DM records that an enemy was Downed, the tracker prompts that a **Follow-Up** is available (and notes Shift eligibility — ailment-free allies, no repeats in the chain). When all enemies are Downed, it surfaces the **All-Out Attack / Synthesis** option. These are prompts and reminders only; the DM resolves and records the outcome. The tracker does not sequence the chain itself in v1.

### 7. Shared player view

A real-time, **read-only** view reflects the DM's tracker: turn order and current actor, the Zone map, and combatant state. **Enemy HP and SP are visible** to players; **enemy affinities are hidden**. (PC state is fully visible.) The view updates live as the DM acts, via polling (see Architecture).

### 8. End of combat

On victory, each Fallen PC self-heals to 1 HP on their own sheet (a normal owner pools write; the tracker shows a reminder but writes nothing). The tracker clears the encounter's combat state by ending the encounter — ailments and battle conditions live on the session, so ending discards them. The DM closes out the encounter, with a hook for whatever post-combat flow (e.g. Spoils) the app later adds.

## Open Questions

- **Invite delivery:** v1 ships an out-of-band join link; emailing the link or an in-app invite inbox are later additive steps over the same membership model.
- **DM grant breadth:** campaign-durable (the DM may adjust a placed PC's vitals anytime) vs encounter-gated (only while a live encounter contains them). Leaning durable.
- **Post-combat flow:** Spoils and other post-combat steps remain a deferred hook.

## Resolved Decisions

- **Engine purity:** Both the game engine and the tracker engine are pure reducers; statefulness lives in the DB and React. The tracker is a reducer over an immutable `CombatSession`.
- **Combat state lives on the combatant:** All encounter-scoped combat state (ailments, battle conditions + durations, Zone, engagement, turn bookkeeping) lives on the combatant in the `CombatSession`. The character keeps only persistent vitals (HP/SP, Exhaustion). _(Supersedes the earlier "durations on the session, `battleConditions` on the character" split.)_
- **Combat conditions are display-only:** The app tracks and shows battle conditions and Charged/Concentrating but computes nothing from them — no dice engine, so the math is manual at the table.
- **Session reducer is the sole writer of combat state:** Expiry and all combat-state transitions mutate the combatant directly; the reducer emits nothing to character rows (no `edits[]`). The only tracker→character write is the DM's manual panel HP/SP adjust; the end-of-combat Fallen-restore is a player self-heal.
- **DM write authorization (campaign-scoped):** A **Campaign** owns the DM↔player relationship; `requireOwnerOrCampaignDM` authorizes vitals writes via a single FK hop (`characters.campaignId → campaigns.dmUserId`). Two-level membership (`campaign_users` + `characters.campaignId`); placement is an owner action (consent); players join by link. The `vitalsVersion` guard reconciles the two-writer case. _(Supersedes the per-encounter `requireOwnerOrEncounterDM`.)_
- **Non-PC modeling:** No per-enemy DB table. Enemy definition is a `catalog | custom` union (hardcoded-TS catalog or free-entry); mutable vitals + overlay live on the combatant.
- **Dead `stacks` field:** Removed from the engine as standalone cleanup before the tracker work (UNN-290); the character's combat-state columns leave entirely at the retirement cutover.
- **Starting combat:** DM declares Player/Enemy/Neutral advantage manually; no automatic ambush roll.
- **Player view visibility:** Enemy HP/SP visible; enemy affinities hidden.
- **Real-time transport:** Polling a `getEncounterSnapshot` projection behind a swappable seam (zero new infra); SSE/push deferred. _(Was an open question.)_
- **Lifecycle:** Removing a player or deleting a campaign unplaces their characters (nulls `characters.campaignId`); a character that is a combatant in a live encounter can't be deleted or unplaced until the encounter ends.
- **Attribute caps:** Already handled correctly by the engine.
- **Concurrent encounters:** One live encounter per campaign is sufficient for MVP.
- **Reaction tracking:** A single "Reaction used / available" flag suffices; there is only one kind of Reaction.

## Suggested Milestones

0. **Cleanup (prereq, done):** Remove the dead `stacks` field from battle conditions (UNN-290).
1. **Campaign (prereq):** Campaign model + two-level membership + join-link flow + character placement; `requireOwnerOrCampaignDM`. Gates the tracker as a whole.
2. **Core loop:** encounter setup within a campaign, catalog/free-entered enemies, sides, manual starting advantage, guided/overridable turn order, and the HP/SP panel writing PC vitals through the (campaign-DM-authorized) pools actions. Run a real encounter solo.
3. **Full state + Zones:** combat state on the combatant — ailments with saving-throw prompts, battle conditions with `CombatSession`-side duration clocks, Charged/Concentrating (track + single-use clear), the Reaction flag, and the Zone/engagement layout. Retire the character's Combat State card + columns at cutover.
4. **Prompts:** Follow-Up / All-Out / Synthesis reminders, end-of-turn and end-of-combat automation.
5. **Shared player view:** real-time read-only sync via polling, with the enemy-affinity-hidden visibility model.
