# Campaign Planner — Technical Design

> **Canonical source.** Companion to [PRD.md](./PRD.md), which owns the product
> decisions; this document owns the technical realization and the build order.
> Produced in the 2026-07-07 design session; amended same day after a
> three-agent validation pass (architecture fact-check, adversarial technical
> critique, product critique). Domain vocabulary lives in the repo-root
> `CONTEXT.md`.

**Status:** Accepted · **Owner:** Jackson

## 0. The through-line: one stored fact per distinction

Every status in this feature is a **selector over a minimal stored fact**,
never a second stored fact:

| Status | Stored fact | Selector |
| -- | -- | -- |
| Slot kind (story/dungeon/downtime) | a beat's `scheduledSlotId`; a `campaignSlotDungeon` claim | beat → story; claim → dungeon; else downtime |
| Set-aside downtime | — (same facts) | entry whose slot currently holds a beat or dungeon claim is suppressed everywhere |
| Deadline Looming/Due | `datedDay` + clock `currentDay` | compare |
| Deadline Resolved | the ⚑ marker update (`resolvesArticleId`) | marker exists ⇔ resolved |
| Overdue-unresolved | same | treated exactly as Due (gates the next advance) |
| Bond progress | `bondTierChangedAt` + the update stream | count Collaborator updates concerning the NPC since the timestamp, **capped at one per PC per day** |
| Bond confirm eligibility | same | progress ≥ 3; "Not yet" stores nothing (ephemeral client dismissal) |
| Day-end readiness | beats' + claims' `resolvedAt` + entries | all story/dungeon slots resolved ∧ per-character entries present (always against the *current* roster — roster drift is accepted, not compensated); "accept empty" fills gaps with Idle entries, so the cue completes honestly |
| Horizon | slot rows | `max(day)` |
| Update kind (world/downtime) | `slotId` nullability | derived |
| NPC stub badge | subtype traits + `narrative` component | `arcana`, `lineageKey`, and `narrative` all absent |
| Entity kind (pc/npc) | which subtype table points at it | derived (R3 landed — UNN-573) |

The cost is concentrated selector complexity — one pure, DB-free module
(`domain/planner/`) with unit tests — bought back everywhere as zero
sync/compensation obligations on edits, deletes, and re-tags. **One deliberate
exception:** the day-end warning's bulk actions (Resolve All / Defer
Unresolved) write *stored* beat facts, so un-advance is **scoped**, not
compensating — see D1.

## 1. Decisions

### D1 — Virtual days; semi-materialized slots

A **day is a plain integer** — no day table. Facts attach sparsely by day
number. **Slots are rows** (`campaignSlot`: campaignId, day, ordinal, label):
one read path (a day's slots are its rows, always), real FK targets for
downtime entries and beat schedules, and "+ Add slot" is one insert. A slot's
`day` is **immutable** — slots are created, renamed, and deleted, never moved.

- **Materialization rule:** slot rows spring into existence from the
  **default-slots template** (jsonb on the clock record, validated to
  **minimum one slot**) at exactly three write points — start-the-clock,
  **Add-days** (Calendar), and **advance/time-skip** (every day in
  `(oldDay, newDay]` that has none). You can never stand on a day without
  slots.
- **Horizon is derived** (`max(day)` over slot rows), never stored.
- **Template applies forward-only:** editing it affects only days materialized
  afterward. Template edits live in **Manage Campaign** ("Day structure");
  per-day slot add/rename are row edits on the Day Runner.
- **Start-the-clock takes a starting day** (default 1) — a DM adopting a
  mid-flight campaign ("we're 40 days in") mints the clock at day 40.
- **The advance gate** blocks while **any unresolved deadline with
  `datedDay ≤ newDay`** exists — not merely deadlines inside the skipped
  interval. This is what makes overdue-unresolved (D5) actually gate: a
  deadline re-opened after its day has passed blocks the *next* advance, and
  the concurrent-marker-delete race degrades safely into that state.
- **The whole advance is one transaction, with the guarded `clockVersion`
  CAS as its last statement** — a two-tab double-advance's loser must not
  leave materialized slot rows beyond `currentDay` (horizon is `max(day)`,
  so leaked rows would silently grow the Calendar).
- **Time-skip** offers an optional **montage pass**: one free-text entry per
  character ("what did they do with these N days?"), each landing as a
  normal downtime-categorized update **stamped on the landing day** (bond
  ticks apply, once). Skipping without it is legal; the pass exists so a
  skip doesn't erase the downtime pillar.
- **Un-advance** is strictly one day at a time and is **scoped**: it
  decrements `currentDay` and unbinds ⚑ markers (D5) — *nothing else*. It
  does **not** reverse the day-end warning's bulk beat mutations (Resolve
  All's `resolvedAt` stamps; Defer Unresolved's unscheduling), bond/story
  confirms, or authored updates; the un-advance confirm says so explicitly.
  What makes the deferred-beats case recoverable is **provenance, not
  undo**: any defer records `deferredFromSlotId`, so the floating shelf
  offers one-click "return to Day 15 · Morning" (available while that slot
  is still beat-free and its day not past).
- **The clock bounds slot-attached writes (past days are frozen).**
  Schedule/unschedule/delete writes touching a slot with
  `day < currentDay` are rejected with a reason — otherwise present-tense
  prep edits would retro-suppress recorded downtime or silently *resurface*
  entries set aside weeks ago (D3). Symmetrically, recording an activity
  requires `slot.day = currentDay`, which also neutralizes stale tabs left
  open after an un-advance.

### D2 — Entity supertype + per-kind subtype tables (the load-bearing decision)

Textbook **table-per-subtype** (class-table inheritance). The `entity` table is the
**supertype/substrate**: components + name/portrait + version tokens. Kind-specific
lifecycle and authorization metadata live in **per-kind subtype tables**, one row
per entity, keyed by the shared id — and *which* subtype table points at an entity
is what makes it that kind (the term "door" from the original draft was retired in
R3 — UNN-573 — because it collided with the *write*-seam "door", `lib/actions/entity/`):

- **`campaignNpc`** (this feature): `entityId` **= entity id** (the shared-id
  convention from S0; the two-table dual-*insert* in one transaction exists
  today in seed/delete paths — this is its first production write),
  `campaignId` (FK, cascade), `arcana?`, `lineageKey?` (typed off the
  kernel's `Lineage` — the stable 12-key union in
  `packages/game-v2/src/kernel/vocab/lineage.ts`), `bondTier`,
  `bondTierChangedAt?`.
- **`playerCharacter`** (**landed — R3, UNN-573**): `entityId` PK,
  `userId`, `status`, `builderStep`, `campaignId` (placement).

Consequences:

- **NPC Identity/Origins is genuinely shared, not mirrored** — it lives in the
  entity's existing `narrative` component (validated: the component's shape —
  ancestry/background/backstory/personality/hopes/dreams/fears/secrets +
  knives/chains — is a superset of the PRD's NPC shape); same editor
  primitives as PCs.
- **Traits stay on the subtype, not in components.** Arcana is a narrative label,
  the bond is party↔NPC campaign state, and the Atlas gate is a hot indexed
  query over `(campaignId, lineageKey, bondTier)` — the engine never reads
  any of it, so the ComponentRegistry and its conformance test are untouched.
  If the statblock cutover later wants Lineage engine-side, lift it at that
  boundary.
- **`entity.kind` evaporated at R3** (dropped, not moved — it had zero runtime
  readers; every consumer now arrives through a subtype table or an explicit
  participant kind). The interim R2 guard (`kind='npc'` + PC-query filters) was
  therefore **never needed** and UNN-572 was canceled.
- **"Exactly one subtype per entity"** is an app invariant (dual-mint in one
  transaction), not a constraint — accepted as discipline. Each subtype's
  `entityId` carries a **plain FK to `entity.id`** (no cascade) — free integrity;
  cleanup is subtype-before-substrate.
- **The read shape carries containment:** a loaded PC is `PlayerCharacterRow &
  { entity }` — the PC is the self, the entity substrate is a part it *has* at
  `.entity`, not a peer. The auth gates return that shape. The NPC parallel is
  `CampaignNpcRow & { entity }` — the same containment, a different subtype.
- **The subtype resolves "who may write this entity" (decide-a-distinction-once).**
  `playerCharacter` carries `userId`; `campaignNpc` carries **no owner** — an NPC is
  the campaign's, authorized by the DM alone via `campaignId → campaign.dmUserId`.
  So the two subtypes answer the write-authorization question differently: a PC by
  *owner or campaign DM*, an NPC by *campaign DM only*. `isOwnerOrCampaignDM` already
  resolves the DM half off `campaignId`; the PC's `userId` match is the owner half an
  NPC subtype simply lacks.
- **NPC-as-combatant** (PRD FR-17) reuses the *same* entity substrate — a combatant
  NPC gains vitals/combat components on its existing entity row (no second mint, no
  sync). The one seam it forces: `requireOwnerOrCampaignDMForEntity` (the durable
  vitals gate the combat door re-checks inside `commitEntityWrite`) resolves the
  entity's **subtype**, not `playerCharacter` specifically. Today it loads the PC
  subtype (`loadPlayerCharacterById`), so an NPC entity would 404; NPC-combatant
  lands the general "load whichever subtype points at this entity, apply its
  who-may-write policy" resolve. The combat action already gates on
  `requireCampaignDM`, so the DM-only NPC case is covered end-to-end. (The `status`
  the durable commit returns is PC-lifecycle only — combat keys on `vitalsVersion`,
  so it is simply unused for NPCs.)

### D3 — One update stream; a downtime activity *is* an update row

`campaignUpdate` is the single timeline unit. A downtime activity is the same
row carrying the **downtime facet** (`slotId` FK + `category`); a world update
is the row with the facet absent. The mock's `world | auto` kind is derived
from `slotId` nullability. Editing an activity from the Day Runner and editing
it from the Chronicle edit the one row; un-advance restores nothing because
nothing moved.

- **The `day` column is a safe denormalization, not drift.** A slotted row's
  `day` is **server-derived from its slot at write time and never
  client-editable** — safe because a slot's `day` is itself immutable (D1).
  This keeps the Chronicle's `(campaignId, day, authoredAt)` cursor index
  join-free. **Re-dating a downtime update is defined as detaching it**: the
  UI's re-date affordance on a slotted row clears `slotId` (it becomes a
  world update, keeping its category — see the weakened facet CHECK, §3)
  and only then accepts a new day.
- **The primary participant is optional.** `primary = null` means "the
  world" — ambient events ("heavy rains wash out the coast road") don't
  force minting a junk Article or misfiling onto a random NPC. It renders
  plainly in the Chronicle and lands on no entity timeline (concerns still
  echo). Downtime rows always carry a primary (the character) — CHECK-enforced.
- **Set-aside is derived state.** An entry whose slot currently holds a
  scheduled beat is suppressed — in the runner *and* on timelines — by the
  same predicate that derives slot kind. Deferring the beat un-suppresses for
  free. Consent happens once, at the "Run story beat over recorded downtime"
  confirm; if the day ends with the beat still there, the entries stay
  suppressed permanently (deliberate: the DM chose the scene over that
  downtime). Two guards keep this honest: **past days are frozen** (D1), so
  later prep edits can't rewrite which entries history suppresses; and
  suppressed entries stay **reachable** — a read-only "set aside" disclosure
  on the slot's history satisfies the PRD's "kept."

### D4 — Participants, tombstones, and the delete policy

Participant refs are the two-column soft ref `(participantKind, participantId)`
— per the PRD's extensibility decision (new kind = new value, never a schema
change), so no DB FKs; `kind ∈ article | npc | character`, where `character`
and `npc` ids are entity ids (npc via the shared-id subtype).

- **Articles & NPCs: tombstone.** Soft-delete; the delete confirm shows
  reference counts. History survives its subjects — timelines keep rendering
  the name, muted. Deleting an NPC also **clears the subtype's `arcana` and
  `lineageKey`** (the Lineage returns to the deck — see D8 uniqueness).
- **Relations touching a tombstone: hard-deleted, both directions.** Relations
  are present-tense authored structure, not history.
- **Characters: uniform with the above** once entity soft-delete lands (R1).
  The participant resolver still tolerates a lookup miss with a fallback
  label — defense in depth, since refs are FK-less.
- **The resolver is campaign-scoped:** `resolveParticipants(campaignId,
  refs[])` refuses cross-campaign hits. This is one half of the FK-less
  design's compensating invariant; the other half is the write-boundary rule
  in §4 (every action validates every ref and FK target against the gated
  campaign).
- Tombstones leave the linker, the list surfaces (behind a filter at most),
  and the relation composer. No restore surface in v1; the persisted row makes
  one cheap later.

### D5 — Deadline lifecycle: zero stored status

The dated facet is two nullable columns on `campaignArticle` — `datedDay` +
`datedKind ∈ event | deadline`, CHECK set-together. At-most-one-date falls out
of them being columns.

- **Resolved ⇔ a non-deleted update with `resolvesArticleId = article` exists.**
  The marker *is* the resolution; "delete/edit the ⚑ marker re-opens the
  anchor" is a tautology, not a rule. A **partial unique index** on
  `resolvesArticleId` makes "at most one marker per article" a database fact
  and kills the double-resolve race.
- **Un-advance unbinds, never deletes:** rolling back from N+1 to N clears
  `resolvesArticleId` on markers stamped `day > N` (the prose survives as an
  ordinary update; re-bind via the existing "↳ Resolves a deadline" control).
  Boundary is `day > N`: a deadline due on N and resolved during N stays
  resolved — you restore the state that legally allowed the advance.
- **Overdue-unresolved** (reachable via unbind, marker delete, or re-dating)
  is not a fourth state: it renders as Due at zero days and blocks the next
  advance (see D1's gate predicate, which makes this real).
- **Re-dating rules** (both directions of the marker⟷anchor bind):
  an update **cannot be re-dated or slot-detached-then-re-dated while it
  carries `resolvesArticleId`** (unbind first) — else it could escape the
  un-advance boundary; and **editing `datedDay` on a *resolved* article
  requires re-opening it first** (the UI offers unbind-and-re-date) — else
  "resolved before it looms" becomes representable.

### D6 — Concurrency: guard where a race corrupts structure

| Write | Mechanism |
| -- | -- |
| Advance / un-advance / time-skip / add-days / per-day slot edits | `clockVersion` guarded compare-and-bump on the clock record, matching the `bumpEntityVersionGuarded` house pattern; the advance's materialize-then-bump runs as **one transaction, CAS last** |
| Bond tier confirm / manual set; story tier advance | natural CAS: `SET tier = :next WHERE tier = :prev` — the domain carries its own token |
| Deadline resolution | the D5 partial unique index |
| One beat per slot | partial unique on `campaignBeat.scheduledSlotId` |
| One activity per character per slot | partial unique on `(slotId, primaryId) WHERE slotId IS NOT NULL` |
| Lineage uniqueness | partial unique (D8); **Arcana is advisory only** — no constraint |
| Prose, beats' content, relations, update bodies, scheduling | **last-write-wins** — single-author edits; annoying, not corrupting |

No realtime in v1: one user, no watch, nothing to push to. Content version
tokens and an Ably channel arrive with the player-watch milestone, at the
boundary where invalidation folds first become load-bearing.

### D7 — Prose: CommonMark + chip tokens; Tiptap custom node

Bodies (beats, Articles, NPC fields) are **markdown strings** with an inline
participant token: `[[kind:id|label]]`. The id is authoritative; the label is
a readable fallback captured at insert; render resolves the current name
through the participant resolver (renames propagate, tombstones mute).

- The house editor is already Tiptap-over-CommonMark
  (`components/editor/markdown-field.tsx`, ADR-001). The chip is a custom
  inline **Node extension** — pill node-view, markdown serialize/parse rules —
  pinned by extending the existing round-trip test. The suggestion machinery
  is **net-new tooling**: `@tiptap/suggestion` (+ its popover positioning) is
  not currently installed and nothing in the app uses Mention/Suggestion yet.
- **Label sanitization:** captured labels strip `|`, `[`, and `]` (the id is
  authoritative and render re-resolves the name, so fidelity loss is nil);
  the round-trip test pins the hostile cases.
- **Dual suggestion trigger on one node:** `@` primary (one keystroke,
  tablet-friendly — quick-minting mid-session is when typing cost matters),
  `[[` as the Obsidian-muscle-memory alias. Storage token is identical either
  way; dropping the alias later costs nothing.
- The suggestion popover **is the composer's "+" linker** — one
  participant-search component, two mounts, same result rows, and **two
  quick-mint rows** (*"Create '⟨query⟩' as NPC"* / *"…as Article"* — no
  kind-picker sub-step in the moment optimized for taps).
- The token grammar (serialize/parse/extract `{kind,id}[]`) is one neutral
  module consumed by the editor, the read-only renderer, the day-end
  pre-suggest, **and the mention index**: beat autosave re-extracts chips
  into `campaignBeatMention` (derived, rebuildable), which powers
  "Referenced in N beats" on entity pages without making beats participants.

**Quick-mint inside the editor is not autosave:** the popover awaits the
discrete mint action (entity + subtype in one transaction), then inserts the
node; the surrounding prose autosaves as usual. Two flows composing.

### D8 — Bond, story tier, and the Atlas seam

- `campaignNpc` stores only `bondTier` (0–4) + `bondTierChangedAt`
  (timestamp, set by confirm *and* manual set/regress). **Progress is
  derived**: count of Collaborator-category updates concerning the NPC with
  `authoredAt > bondTierChangedAt`, **counting at most one per PC per day**
  (kills the same-evening pile-on and the "both slots = two ticks"
  double-count from an all-day activity recorded per-slot). Timestamp, not
  day: same-day activities after a same-day confirm must count correctly.
- **Un-advance asymmetry, stated:** a tier confirmed during day N survives
  un-advancing into day N — consistent with D5's boundary (state that
  legally existed during the day stays). Manual regress is the recovery, and
  it costs the progress: the activities that drove the confirm are older
  than the new `bondTierChangedAt` and never count again. Deliberate.
- **Uniqueness — Lineage hard, Arcana soft:** partial unique on
  `(campaignId, lineageKey) WHERE lineageKey IS NOT NULL` (load-bearing:
  every Lineage has at most one gate-holder). **Arcana carries no
  constraint** — the DM guide explicitly blesses breaking one-per-Arcana
  ("don't let it stop you if you have a brilliant idea"), so the picker shows
  a *"held by Maren"* warning and allows it. Deleting an NPC clears both
  columns (the Lineage returns to the deck).
- **Story tier** (`storyTier` on the clock record, CAS writes; **treated as
  0 when the clock hasn't been started**): the party's shared arc, advanced
  by the DM; resolving a deadline **pre-suggests** an advance at Day-End
  (nudge, never auto).
- **Availability is a union of lanes** — no collision rule exists:
  - *Origin lane:* your own Origin Lineage opens at `max(1, storyTier)` —
    Initiate is always reachable; higher tiers ride the campaign's arc.
  - *Bond lane:* the Lineage held by an NPC opens at that NPC's `bondTier`,
    party-wide.
  - A lineage is available at the best tier any applicable lane grants.
    Worked fairness example: party at story 2, Maren (Stormcaller) at
    bond 4; a mid-campaign joiner whose Origin is Stormcaller gets
    Stormcaller@4 — which every veteran already has via the bond. Their set
    is subset-or-equal of the table's. `min` would uniquely lock the native
    out of what everyone else has.
- **The engine seam targets the v2 atlas, which already exists**
  (`packages/game-v2/src/archetypes/atlas.ts`, same signature and
  `{ hiddenArchetypeKeys? }` options bag as v1 — the port is done; **S3
  re-points the app to it**). Gating adds `narrativeGate?:
  ReadonlyMap<Lineage, number>` (lineage → open tier) to the **v2** options
  bag — never the doomed v1 one. `undefined` = gating off = all-open,
  non-breaking by construction. The engine applies the Initiate origin floor
  itself (it already tracks `isOrigin`/`originLineage`); *why* a lineage
  opened never crosses the boundary. The app-side fold over `campaignNpc`
  rows + `storyTier` is a pure `domain/planner/` function; the
  `campaigns.lineageGating` boolean (default false, edited in Manage) turns
  it on.

### D9 — Dungeon slot claims (the delve takes the morning)

Dungeons consume time slots (§2.2: "your DM will tell you when a day's slots
are spoken for") via a **concrete claim table**, the mirror of how beats claim
slots: `campaignSlotDungeon` — `slotId` (unique: one dungeon per slot),
`dungeonId` (**real FK, cascade** — deleting the dungeon reverts its slots to
downtime, matching beat-deletion behavior), `resolvedAt?`. Many slots per
dungeon is free (a delve claiming both slots; re-entering on Day 20). A
generic `slotClaim(kind, refId)` was rejected: a polymorphic ref can't FK,
and per-kind claim tables are the same pattern as the per-kind subtype tables —
concrete tables, derived kind. Encounters wanting slots later = a second
small table.

- **Slot kind gains a third arm, still one decision point:** beat → story;
  dungeon claim → dungeon; else downtime. Mutual exclusion (never both a
  beat and a claim) is a write-boundary check; each table's unique guards
  its own side. The set-aside predicate extends to "beat *or* claim."
- **"Run a dungeon"** on a downtime slot works exactly like "Run a story
  beat" (same set-aside confirm over recorded downtime). **No
  consumes-the-day checkbox:** the DM claims one slot; if the party runs
  long, they claim the next slot with the same dungeon — the §2.2 default
  is narration, not enforcement, and the DM can't know the delve's length
  in advance.
- **Runner card:** dungeon name, "Open dungeon console" (the existing
  dungeon console route `/campaigns/[campaignShortId]/dungeon/[shortId]`,
  built via `lib/paths.ts`'s `dungeonConsolePath`), Mark resolved / Reopen
  (on the claim), Remove
  (unclaim → downtime). **Coupling is one-directional and manual:** the
  dungeon console never touches the clock; dungeon `status` never
  auto-resolves the slot; nothing auto-advances. The PRD's old "no FK to
  dungeons" letter is amended; its "no behavioral coupling" spirit holds.
- **Calendar** day-cards can schedule a delve ahead; frozen-past rules
  apply. **Day-end:** a resolved dungeon slot **pre-suggests** a
  primary-less world update ("The party delved ⟨name⟩"); the warning's
  Resolve All resolves unresolved claims, Defer Unresolved **unclaims**
  them (the delve didn't happen; the dungeon list keeps the dungeon —
  re-claim tomorrow), stated in the confirm.
- **Idle** joins the category enum: a one-click per-character mark for "did
  nothing substantial" (empty body legal), muted in the Chronicle and
  filtered out by default. The day-end warning's **"accept empty" writes
  Idle entries** for every missing character — explicit DM consent, the
  same moment it always was, but now the record is honest and the readiness
  cue can complete. Downtime remains the only auto-source; Idle is downtime.

### D10 — Shell, routing, and the two write flows

- **Routes** nest under `app/campaigns/[campaignShortId]/`: root page = Day Runner,
  siblings `notes/`, `calendar/`, `chronicle/`, `articles/[id]`, `npcs/[id]`,
  and the existing manage content relocated to `manage/`. The **viewer fork
  is decided once at the root page**: DM → Day Runner; member → today's
  member view (unchanged — members who can see the page today keep seeing
  it); stranger → 404-collapse. Nested surfaces are uniformly DM-only via a
  co-located `planner-access.ts` (`getCampaignForDM`, ≅ `getDungeonForDM`).
  The layout renders the icon rail for the DM shell. Day-End Capture is a
  runner-owned ritual view, not a route destination.
- **Discrete writes** (record activity, schedule/defer/run, advance, resolve,
  relations, tier confirms): Server Action → `requireCampaignDM` →
  cross-campaign ref validation (§4) → D6 guard → `revalidatePath`.
  Interactions ride `useTransition`; controls never disable on pending.
- **Prose/title writes** (beat body/title/tagline, Article prose, NPC
  Identity/Origins): **debounced autosave** (~800 ms, flush on blur/unmount),
  no revalidation — the editor is client-owned while mounted (RSC seeds once;
  `markdown-field` already guards echo resets). Failure = keep the buffer,
  retry quietly, "couldn't save" indicator. LWW per D6.
  **Hook lineage (corrected by validation):** a generic debounced core
  already exists — `domain/entity/use-debounced-auto-save.ts` — but it is coupled to
  the per-write-class version-token providers; the closer LWW precedent is
  `app/maps/_hooks/use-map-autosave.ts`, and **UNN-483 already tracks extracting the
  shared core those two duplicate**. The planner consumes that consolidated
  LWW core (landing UNN-483 as part of phase 3 if it hasn't landed) rather
  than minting a third duplicate.
- **The composer mounts in four places**, one primitive: the Day Runner's
  downtime workspace, Day-End Capture, **entity pages**, and **the
  Chronicle** — the latter two so mid-session world events get captured when
  they happen (day-stamped `currentDay`) instead of recalled at 11pm.
- **Runner vitals glance read boundary:** the roster needs N placed
  characters' resolved state per render. One batch read (the
  `lib/db/queries/load-entity` batch precedent) → `domain/game-v2/entity-row-to-bag` → the v2
  `resolve` fold → a pure glance view builder. Never N×
  `loadCharacterByShortId`.
- The clock record is minted by an explicit **"Start the clock"** action
  (existing campaigns have none) taking a starting day; the Day Runner's
  empty state offers it as step one of a three-step first-run checklist
  (start the clock → add your first beats → mint the NPCs you already know);
  pre-clock Calendar/Chronicle point home.

### D11 — Folder trees for world entities (adjacency list; Unfiled stays derived)

Articles and NPCs are organized in **freeform nested folder trees**
(Obsidian-like), one forest per surface — they are separate things on separate
screens, so an Article folder never holds an NPC. This amends phase 6, which
originally specced flat lists; the `type` tag survives as an **orthogonal**
scheme (the tree is navigation, `type` is a filter chip — two schemes, not two
competing taxonomies).

- **Representation: adjacency list.** One `campaignFolder` table — a folder is
  a folder; *which tree* is a `kind` parameter (`article | npc`), not a reason
  to fork the table (§0) — with a nullable `parentId` self-FK. The alternatives
  (materialized path/ltree, closure table, nested sets) buy fast subtree
  *reads* at the cost of expensive *moves*, which is backwards for a
  reorganize-freely UI and moot at campaign scale: the read is always the
  **whole forest** (one `WHERE campaignId AND kind` query) assembled by a pure
  `domain/planner` tree builder. A move is a single-row `parentId` update.
- **Kind agreement is a DB fact:** `UNIQUE (id, kind)` lets the self-FK be the
  composite `(parentId, kind) → (id, kind)`, making a cross-kind parent
  unrepresentable. Item membership (`folderId` must point at a same-kind,
  same-campaign folder) is action-validated per the §5 boundary rule.
- **Unfiled stays derived** (the `campaignBeat.sessionId` precedent): items
  carry a nullable `folderId`, `ON DELETE SET NULL`; never a magic row.
- **Cycles:** the self-FK doesn't forbid them. The move action rejects a new
  parent that is a descendant of the moved folder (ancestor walk — cheap at
  this scale); the tree builder treats any node whose ancestry never reaches a
  root as Unfiled, so a slipped cycle degrades visibly instead of vanishing
  content.
- **Delete = cascade folders, float contents:** the self-FK's
  `ON DELETE CASCADE` removes a subtree's folders in one statement while each
  folder's SET-NULL contents float to Unfiled. Folders **hard-delete** —
  purely organizational, nothing historical references one (unlike Articles'
  tombstones). Confirm shows contained counts.
- **Ordering is alphabetical** — no position column. Manual ordering
  (fractional index) is an add-later that touches no existing rows.
- **v1 UI:** recursive disclosure rows; "Move to…" context-menu picker rather
  than drag-and-drop (DnD layers on later without schema change);
  expand/collapse state client-local.
- **Session Notes parity is a follow-up (UNN-617):** `campaignSession` stays
  flat for now; the follow-up absorbs sessions into this table
  (`kind = 'session'` — sessions are documented as purely organizational) and
  repoints `campaignBeat.sessionId` → `folderId`. `campaignFolder` is designed
  to absorb that without change.

## 2. UX deltas from the design handoff

Accepted in the validation pass; the handoff mocks remain authoritative for
visuals, these amend behavior:

- **The runner renders the beat body inline** (read-only, collapsible) in the
  beat card; "Open notes" remains for editing. The at-table surface must not
  bounce the DM away mid-scene.
- **Composer copy affordances:** "copy this entry to other characters…"
  (writes N rows — exactly what the PRD says a DM does by hand for party-wide
  downtime), "repeat this character's last activity," and category pre-fill
  from the character's previous entry.
- **Calendar ribbon clamps** far deadlines at the grid edge ("→ Day 74");
  the beat **schedule control becomes day-picker → slot-picker** (a flat
  enumeration of every open slot doesn't survive a 30-day horizon), occupied
  slots disabled.
- **Tablet layout** (the PRD's stated at-table context): roster sidebar
  collapses to a sheet, the slot rail horizontal-scrolls, the composer goes
  full-width. Breakpoints decided in phase 1 with the shell, not retrofitted.
- **Set-aside disclosure** on a story/dungeon slot's history (D3) and the
  floating shelf's "return to Day N · Slot" provenance affordance (D1).
- **"Run a dungeon"** sits beside "Run a story beat" in the runner's slot
  menu (D9): pick from the campaign's dungeons, claim the slot, extend by
  claiming the next slot if the party runs long. A one-click **Idle** mark
  sits on each character's card for quiet evenings.
- **The Articles + NPCs rails are folder trees, not flat lists** (D11):
  Obsidian-like nesting, alphabetical, "Move to…" context menu in v1 (no
  drag-and-drop), expand state client-local. The type filter remains, as a
  chip over whatever the tree shows.
- The handoff README's "the app silently adjudicates… 5 practice activities →
  a Talent" line is **stale** (pre-dates the rewards-removal decision); the
  PRD carries the erratum.

## 3. Schema

New tables (all `campaignId` FKs cascade on campaign delete; names follow the
house camelCase-singular convention — `mapInstance`, `characterKnife`):

```
campaignClock         campaignId PK/FK · currentDay int (≥1) · slotTemplate jsonb [{label}] (min 1)
                      · storyTier int 0..4 · clockVersion int · timestamps
campaignSlot          id · campaignId · day int (immutable) · ordinal int · label
                      · UNIQUE (campaignId, day, ordinal) · INDEX (campaignId, day)
campaignSeason        campaignId · day · label · UNIQUE (campaignId, day)
campaignSession       id · campaignId · name · timestamps          (flat; folder-tree parity → UNN-617, D11)
campaignBeat          id · campaignId · sessionId FK→session ON DELETE SET NULL (null ⇒ virtual "Unfiled")
                      · title · tagline · body (markdown) · scheduledSlotId FK→slot ON DELETE SET NULL
                      · floating bool · deferredFromSlotId? FK→slot ON DELETE SET NULL
                      · resolvedAt? · timestamps
                      · CHECK NOT (scheduledSlotId IS NOT NULL AND floating)
                      · UNIQUE (scheduledSlotId) WHERE scheduledSlotId IS NOT NULL
campaignSlotDungeon   slotId FK→slot (UNIQUE) · dungeonId FK→dungeon ON DELETE CASCADE
                      · resolvedAt? · createdAt
                      (a dungeon claims a slot; deleting the dungeon reverts its slots to downtime)
campaignBeatMention   beatId FK cascade · participantKind · participantId
                      · PK (beatId, participantKind, participantId)
                      · INDEX (participantKind, participantId)
                      (derived from body chips on autosave; rebuildable)
campaignFolder        id · campaignId · kind article|npc · parentId? · name · timestamps
                      · UNIQUE (id, kind)                                  (composite-FK target)
                      · FK (parentId, kind) → (id, kind) ON DELETE CASCADE (cross-kind parent
                        unrepresentable; deleting a folder cascades its subtree's folders)
                      · INDEX (campaignId, kind)
                      (D11: one forest per surface; hard-deletes — organizational, like sessions;
                       cycle guard is the move action's ancestor walk, builder degrades to Unfiled)
campaignArticle       id · campaignId · folderId? FK→campaignFolder ON DELETE SET NULL (null ⇒ Unfiled)
                      · name · type (label-only text) · body (markdown)
                      · datedDay? int · datedKind? event|deadline · deletedAt? · timestamps
                      · CHECK (datedDay IS NULL) = (datedKind IS NULL)
                      · INDEX (campaignId, datedKind, datedDay)
campaignNpc           id (= entity id; FK→entity, no cascade) · campaignId · arcana? · lineageKey?
                      · folderId? FK→campaignFolder ON DELETE SET NULL (null ⇒ Unfiled)
                      · bondTier int 0..4 · bondTierChangedAt? · timestamps
                      · UNIQUE (campaignId, lineageKey) WHERE lineageKey IS NOT NULL
                      (Arcana: advisory only — picker warning, no constraint)
campaignRelation      id · campaignId · sourceKind · sourceId · targetKind · targetId
                      · label? · createdAt
                      · INDEX (campaignId, sourceKind, sourceId)
                      · INDEX (campaignId, targetKind, targetId)   (tombstone cleanup + ref counts)
                      (no uniqueness — parallel edges with different labels are legal;
                       "bidirectional" is a convenience that writes the reverse row)
campaignUpdate        id · campaignId · day int (slotted rows: server-derived from the slot,
                        never client-editable — safe denormalization of an immutable fact)
                      · primaryKind? · primaryId? (null pair ⇒ "the world")
                      · body (may be empty for idle) · category? virtue|talent|practical|collaborator|idle
                      · slotId? FK→slot ON DELETE RESTRICT · resolvesArticleId? FK→article (RESTRICT;
                        moot in practice — articles only soft-delete)
                      · authoredAt · updatedAt
                      · CHECK (primaryKind IS NULL) = (primaryId IS NULL)
                      · CHECK (slotId IS NULL OR category IS NOT NULL)      (slotted ⇒ categorized;
                        world updates may carry an optional category — FR-13's filter needs it)
                      · CHECK (slotId IS NULL OR primaryKind IS NOT NULL)   (slotted ⇒ has a primary)
                      · CHECK (resolvesArticleId IS NULL OR slotId IS NULL) (markers are world updates)
                      · UNIQUE (resolvesArticleId) WHERE resolvesArticleId IS NOT NULL
                      · UNIQUE (slotId, primaryId) WHERE slotId IS NOT NULL
                      · INDEX (campaignId, day, authoredAt)                 (Chronicle cursor)
                      · INDEX (campaignId, primaryKind, primaryId)
campaignUpdateConcern updateId FK cascade · participantKind · participantId
                      · PK (updateId, participantKind, participantId)
                      · INDEX (participantKind, participantId)
```

Modified: `campaigns` + `lineageGating bool default false`; `entity` +
`deletedAt` (R1 — landed, UNN-571). (`entity.kind` was **dropped** in R3, not
widened to `'npc'` — the interim R2 guard was canceled; see §6.) New dependency:
`@tiptap/suggestion` (+ popover positioning). Schema files:
`lib/db/schema/campaign-clock.ts`, `lib/db/schema/campaign-world.ts`.

**First-of-kind warning:** this schema leans on partial unique indexes and
CHECK constraints, of which the existing schema has **zero**. Both are
expressible in the pinned drizzle-orm/drizzle-kit, but phase 1 starts with a
**one-migration spike** proving the generated SQL before the full schema
lands.

Per-entity timeline read = updates where primary-or-concerned (union over the
two indexes), ordered `(day, authoredAt)`; Chronicle paginates on the cursor
index.

## 4. Pure layer — `domain/planner/`

Selectors (see §0 table): `slotKind` (beat → story; claim → dungeon; else
downtime), `dayProgress`, `deadlineState`,
`advanceGate` (any unresolved deadline ≤ newDay), `seasonOf(day)`
(inherit-forward scan), `bondProgress`/`bondEligibility` (one-per-PC-per-day
cap), `dayEndReadiness`, `availabilityFold` (origin + bond lanes →
`narrativeGate` map; storyTier 0 pre-clock), `isSetAside`, `isStub`,
`isFrozenDay`, and the D11 folder-forest builder (rows → alphabetical tree +
derived Unfiled; unrooted/cyclic nodes degrade to Unfiled) with its
`isDescendant` cycle guard. Plus per-surface view builders (`view/runner.ts`,
`view/calendar.ts`, `view/chronicle.ts`, …) per the `domain/character/view`
precedent, the chip-token grammar module (serialize/parse/extract — also
feeds the `campaignBeatMention` maintenance), and the campaign-scoped
participant resolver. All DB-free, unit-tested. Components are
feature-colocated under `app/campaigns/[campaignShortId]/_components/`
(runner/, notes/, calendar/, chronicle/, world/, composer/) per the
feature-first colocation rule (UNN-610) — importable across the campaign
route subtree, not a shared `components/` kit. The custom Article-type picker offers a hardcoded curated list ∪
the campaign's existing distinct `type` values; the column stays free text.

## 5. Write map

All gate on `requireCampaignDM`; `campaign-access.ts` unchanged
(`requireOwnerOrCampaignDM` unused — the feature writes no character state).

**Boundary rule (compensates the FK-less refs):** every action validates
every participant ref *and* every FK target (`slotId`, `resolvesArticleId`,
`scheduledSlotId`, `sessionId`) against the gated campaign's `campaignId`
before writing; `resolvesArticleId` must additionally point at a
`datedKind = 'deadline'` article; slotted updates require
`primaryKind = 'character'`. The participant resolver is campaign-scoped
(D4). Cross-campaign refs are otherwise representable and would leak one
campaign's names into another.

| Action | Effect | Guard / rule |
| -- | -- | -- |
| Start the clock | mint clock row (starting day param) + that day's slots from template | insert-once (PK) |
| Advance / time-skip N | gate check (any unresolved deadline ≤ newDay) → materialize missing slots → optional montage entries → `currentDay += N` | one tx, clockVersion CAS last |
| Un-advance | `currentDay -= 1` (floor 1) → unbind markers `day > new` | clockVersion; scoped (does **not** undo day-end bulk beat actions — confirm says so) |
| Add-days / slot add·rename / template edit | slot rows / template jsonb (min 1 slot) | clockVersion |
| Delete slot | confirm → float its beat (with provenance) → delete | RESTRICTed by entries FK; frozen if past |
| Set / clear season | `campaignSeason` upsert/delete | LWW |
| Set / edit / clear article date | `datedDay`/`datedKind` | resolved article: unbind first (D5) |
| Record / edit / delete activity | upsert update row (downtime facet + concerns; `day` derived from slot) | `slot.day = currentDay`; partial unique (slot, primary); LWW body |
| Re-date a downtime update | **detach** (clear `slotId`, keep category) + set day | forbidden while ⚑-bound |
| Author / edit / delete world update (Day-End, entity page, Chronicle) | update row (+ concerns; primary optional) | LWW; marker delete/edit re-opens anchor (derived) |
| Resolve deadline (either entry point) | world update with `resolvesArticleId` | partial unique |
| Schedule / defer / run beat | `scheduledSlotId` / `floating` flips; defer records `deferredFromSlotId` | partial unique (slot); slot must hold no dungeon claim; **frozen for `slot.day < currentDay`**; LWW |
| Claim / unclaim / resolve dungeon slot | `campaignSlotDungeon` row; unclaim deletes it | unique (slot); slot must hold no beat; dungeon must belong to the campaign; set-aside confirm over recorded downtime; frozen if past |
| Mark idle / accept-empty fill | Idle update row per open character (empty body) | same partial unique (slot, primary); bulk fill only via the day-end warning's explicit consent |
| Delete / unschedule beat | row delete / schedule clear | confirm when scheduled; **blocked while scheduled to a past slot** (it is history's structure) |
| Mark beat resolved / reopen | `resolvedAt` | LWW |
| Bond confirm / manual set; story-tier advance | `tier`, `tierChangedAt` | CAS |
| Quick-mint NPC / Article (linker or surfaces) | article row, or entity + subtype dual-mint (one tx) | tx |
| Assign Arcana / Lineage | subtype columns | Lineage partial unique; Arcana advisory warning |
| Delete NPC / Article | set `deletedAt` (entity for NPCs) + clear arcana/lineage + hard-delete touching relations | tx; confirm shows ref counts |
| Folder create / rename | folder row | parent must match campaign + kind (composite FK carries kind) |
| Folder move | `parentId` update | reject a parent that is a descendant of the moved folder (D11) |
| Folder delete | delete row (self-FK cascades subtree; contents float to Unfiled via SET NULL) | confirm shows contained counts |
| Move Article / NPC to folder | `folderId` update | folder must match campaign + kind |
| Relations add/remove; "also add reverse" | edge rows | LWW |
| Prose/title autosave (+ mention re-extract for beats) | body columns + `campaignBeatMention` sync | LWW, no revalidate |
| Delete campaign (existing) | now also soft-deletes the campaign's NPC entities (subtypes cascade; substrate rows must not orphan) | tx |

## 6. Riders (standalone tickets, not planner milestones)

- **R1 — Entity soft-delete.** `deletedAt` on `entity`; delete flow flips from
  `DELETE` to `SET deletedAt = now()` (`lib/actions/entity/delete.ts`).
  **Landed (UNN-571).** The naive "~7 read sites gain a `deletedAt IS NULL`
  conjunct" resolved into a **three-way split**, keyed to *why* a caller holds
  the id (not id-vs-shortId), because the combat-adjacent sites needed the
  semantics decision, not a WHERE clause:
  - **Discovery / identity reads filter** — a tombstone vanishes from every
    surface and its public URL 404s: the three `character-list` queries,
    `load-campaign`'s roster read, and `load-entity`'s `loadEntityRowByShortId`
    (which also covers `load-character`, since `loadCharacterByShortId`
    composes it).
  - **Live occupancy / setup reads filter** (`loadLiveEntityRowById` /
    `loadLiveEntityRowsByIds`) — the id comes from *current* dungeon-Instance
    occupancy or a client-supplied combat setup, so a tombstone must read as
    absent: the delve's own-sheet column (`loadCharactersByIds`), its
    token-vitals bars (`loadPartyVitalsByIds`), its owned-token highlight
    (`loadOwnedDungeonCharacterIds`), and the two combat-setup adds
    (`applyAddParticipant`, `startDungeonEncounterAction`). Soft-delete never
    clears occupancy, so without this a deleted PC lingers on a delve surface or
    gets wired into a *new* fight (the Codex review on PR #331 caught this).
  - **Pinned persisted-locator reads stay `deletedAt`-blind** — they resolve an
    id already committed into a stored encounter session blob:
    `load-entity`'s by-id reads (`loadEntityRowById` / `loadEntityRowsByIds`),
    `encounter-lock`, `load-combat-console-data-v2`, the snapshot fold
    (`loadDurableEntities`), the owned-combatant watch read
    (`load-encounter-snapshot-v2`), the auth gates, and `versions` (which
    inherits the gate). **The live-encounter lock is the guard, unchanged:** a
    durable combatant can't be tombstoned mid-fight, so a live encounter never
    references one. Filtering these would instead turn a soft-deleted reference
    into a `missing-durable` dangling ref → `participant-load-failed` → a 404'd
    in-progress fight. Resolving the persisted row by pinned id is also what
    lets history survive its subjects (D4).

  NPC-as-combatant (phase 2+) makes this real by adding components to the same
  entity row — no new mint, so the same lock + pinned-blind reads carry over.
  Prerequisite for phase 2. Valuable independent of this feature.
- **R2 — Interim `kind: 'npc'` + PC-query filters. Canceled (UNN-572,
  superseded by R3).** R2 was the *interim* guard (widen `EntityKind` +
  add `kind='pc'` filters to the PC-facing `character-list.ts` queries),
  needed only while `entity.kind` still existed. R3 **dropped** `entity.kind`
  outright — an entity's kind is now which subtype table points at it, so no
  filter was ever needed. My Characters naturally shows no NPCs because it
  reads the `playerCharacter` subtype, which an NPC entity has no row in.
- **R3 — `playerCharacter` subtype extraction. Landed (UNN-573).** `ownerId`
  (→`userId`)/`status`/`builderStep`/`campaignId` moved to the new `playerCharacter`
  subtype table (`schema/player-character.ts`); `kind` was **dropped** (an entity's
  kind is now *which subtype table points at it* — `playerCharacter` today,
  `campaignNpc` later). The auth gates load the PC (subtype ⋈ substrate) and return
  the containment shape `PlayerCharacterRow & { entity }`
  (`requireOwnerOrCampaignDMForEntity`/`requireEntityOwner`); every PC-scoped read
  (`character-list`, `load-campaign` roster, `load.ts`, encounter-lock,
  `load-encounter-v2` owners) joins the subtype; `builderStep`/`status` left the
  identity version guard and write unguarded through the subtype (`builderStep` a
  plain update, `status` finalize's follow-on flip). The **one-subtype invariant**
  ("exactly one subtype per entity") is app discipline: the supertype+subtype pair
  mints in one transaction at every write site (cleanup is subtype-before-substrate,
  the FK has no cascade). `conformance.test.ts` pins that `entity` carries none of
  the moved columns. This retired the interim R2 (UNN-572, canceled) — no
  `kind='pc'` filters were ever needed.
- **(Adjacent, pre-existing) UNN-483 — autosave-core consolidation.** The
  planner consumes its LWW core (D10); land it by phase 3 if still open.

## 7. Build order

Each phase shippable; PRD's milestone list superseded by this (the PRD's M1
had the composer depending on participants that didn't exist until its M4 —
the world substrate is pulled forward).

0. **Riders R1 (landed, UNN-571), R3 (landed, UNN-573)** — R2 canceled
   (UNN-572, superseded by R3)
1. **Clock core** — drizzle spike (partial uniques + CHECKs) first; clock
   record, slot rows, advance/un-advance/skip (+ montage pass), add-days +
   template, route restructure + rail shell incl. tablet breakpoints (Manage
   relocates now), first-run checklist empty state
2. **World substrate (thin)** — article + npc/entity dual-mint, participant
   ref module + campaign-scoped resolver, linker + two-kind quick-mint stubs.
   No relations/pages yet
3. **Session Notes + Runner downtime** — updates table, beats + chip node
   (`@tiptap/suggestion`), mention index, composer (category, concerns, copy
   affordances), autosave via the UNN-483 core
4. **Story beats + Defer/Run + dungeon claims + day-end warning** — incl.
   inline beat body, "Run a dungeon", Idle marks + accept-empty fill,
   set-aside disclosure, defer provenance
5. **Calendar + dated Articles** — facet, ribbon (clamped), agenda,
   day-picker scheduling, add-days, seasons, events
6. **Entity pages + relations + full authoring** — folder trees for the
   Articles/NPCs rails (D11: `campaignFolder` + `folderId` columns, tree
   builder, folder CRUD/move actions), pickers (Lineage enforced, Arcana
   advisory), stub badge, the directed web, "Referenced in N beats",
   entity-page composer mount. Session Notes parity follows as UNN-617
7. **Day-End Capture + Chronicle + per-entity timelines** — pre-suggests,
   ⚑ resolution, un-advance UX, Chronicle composer mount
8. **Bond + story tier + Atlas gating** — **behind S3** (atlas re-point to
   the already-ported v2 `buildLineageAtlas`)

## 8. Deliberately deferred (unchanged from PRD)

Chronicle's concrete layout (designed before phase 7 builds it; its header
reserves a slot for the search box below); **full-text search** over
bodies/names (Postgres FTS, fast-follow — the corpus that grows unboundedly
is exactly the one with no search); the player visibility/watch model (adds
content version tokens + realtime channel at that boundary); P2 activity
library; NPC statblock cutover (adds components to the same entity row);
recurring events (an Article carries at most one date in v1); scene/social
play mode (sibling PRD).
