# Decision log — Engine v2, the Character Domain (Characters v2)

Chronological rationale behind [`ADR.md`](./ADR.md). Each entry: the decision,
why, and what was rejected. Statuses: **Settled** / **Leaning** / **Open**.
`D<n>` cites the parent ADR, `CD<n>` the combat ADR, `SD<n>` spatial.

Program context (how we got here — the port-in-place diagnosis, the fresh-start
premise change, the greenfield-app rejection) lives in
[`HANDOFF.md`](./HANDOFF.md) and is not restated per-entry.

---

## CH1 — The cutover unit is the vertical slice; storage moves from last to first · **Settled** (amends D23; supersedes UNN-543/545/546/548/549's sequencing)

**Decision.** Rebuild the character domain surface-by-surface, each slice
end-to-end on v2-native shapes, deleting its v1 predecessor on landing. The
`entity` table (UNN-511) is the foundation slice, not the capstone.

**Why.** D23's "table last, backfill from `characters`" was risk management
for data that must survive. On 2026-07-01 character data was declared
expendable (fresh-start, no backfill) — the premise died but the sequencing
built on it kept walking (the port roadmap's `rawInputsToEntity`-as-permanent,
`pool-write-adapter`, preserved row contracts are all storage-last
scaffolding). Port-in-place also kept every v1 surface contract alive, and the
sum of the adapters those contracts demand is a shadow engine in
`apps/web/lib/game-v2/` — the exact accretion the parent ADR exists to
prevent. The failure has a name: **strangler fig without a kill date** — the
strangler pattern is only sound when each vine replaces (not wraps) a limb.
Vertical slices are the replace form.

**Rejected.**
- *Port-in-place waves (the 2026-07-03 roadmap)* — verified findings survive
  (mined into this ADR), sequencing dies. It optimized "every PR keeps v1
  green" at the cost of building three adapters the end-state deletes.
- *Greenfield app* — over-scoped; combat is already thesis-correct and
  liftable. The fault line is the character domain, not the app shell.

---

## CH2 — The `entity` table: engine components + app-owned columns; child tables fold; fresh start · **Settled** (storage projection revised by CH15 — components are per-component columns, not one jsonb bag; the knives/chains and narrative paragraphs below are partially superseded there)

**Decision.** One `entity` table per ADR §2.2: query metadata as columns;
`name`/`portraitUrl` as columns *lifted* into components at load (D35's middle
case); **`level` component-only** (amends D39's "also a column" — see below);
narrative as app-owned column-only fields;
knives/chains as app-owned jsonb lists; every engine-read structure in one
`components` jsonb whose contract is `rawInputsToEntity`'s proven output (minus
CH8's drops, plus `sparkLog`). `characterArchetypes` folds into
`components.archetypes` keyed by **archetype key** (surrogate row-ids die;
`sourceArchetypeKey` per D36; Atlas rank-up naturally keys by `ownedKey`).
`actionLogEntries` survives re-keyed to `entityId`.

**Why the jsonb contract is inherited, not invented.** UNN-533's golden-master
proves `rawInputsToEntity`'s output derives byte-identically to v1. Making that
shape the *stored* shape means storage lands pre-verified and the projector
retires (nothing left to project) — the single highest-risk artifact of the old
plan (backfill with maxHP-resolution-at-migration) never exists.

**Why `level` lost its column (2026-07-05, Jackson's challenge; amends D39).**
The column's D35 justification was "engine-read AND queryable" — but no query
filters or sorts on level (SELECT-only, servable from jsonb), so "queryable"
never held relationally. Decisive was the structural argument: not every
entity kind has a level (O12's `kind: 'object'`), and a column whose
applicability varies by kind re-encodes the kind distinction as per-kind
nullability — the `CombatantRef` arm-audit reborn in DDL. Sharpened rule:
engine-read facts are capability-presence in `components`; **a column must be
universal across entity kinds**. `name`/`portraitUrl` pass (identity/
presentation apply to every kind; name is genuinely queried as the list sort
key). Engine-blind app-feature metadata (`builderStep`) may be feature-scoped
— the engine cannot leak what it cannot see.

**Why knives/chains are columns, not components.** The component registry is
the engine's vocabulary (D35). Knives/chains have zero engine readers — putting
them in `components` would grow the engine's type surface for the app's
convenience. Conversely narrative-as-jsonb-blob was rejected because per-field
debounced autosave over one blob column reintroduces read-merge-write races
(the UNN-226 class); per-field columns keep each write a single-column UPDATE.

**Rejected.**
- *`characterArchetype` survives as a child table* — its two reasons to exist
  (FK target for `activeArchetypeId`; per-row `mechanicState`) both dissolve
  (keys replace row-ids; `components.mechanics` is per-kind already).
- *A `narrative` jsonb bag* — see above.
- *Dropping the action log* — it's a cheap table and the undo feature's fate is
  a sheet-slice design call, not a storage call (ADR §5).

---

## CH3 — Signed depletion is storage-native; level-up collapses to single-class · **Settled** (Q2 rider closed 2026-07-05: level-up does NOT restore vitals — Jackson's rules call; `damage` persists, current rises by the max delta)

**Decision.** Store `damage`/`spSpent`/`*Used`; no absolute pool columns, no
`prismaCharges(+Max)`. The `pool-write-adapter` is never built. Level-up stops
being the codebase's one cross-class write.

**Why.** D9/D10/D26 are the settled model; the only reason absolute columns
were going to persist even a day longer was storage-last sequencing. The
level-up collapse falls out: v1 bumped `vitals` + `progression` together
because raising max required rewriting `currentHP`; under depletion the
current derives, so the write is progression-only and the
`expectedVersions`-pair special case (documented in `version-classes.ts` as
the one map outsider) dies. **Rider:** confirm the rulebook attaches no
explicit restore-on-level-up rule; if it does, it's a multi-component Writer
patch, still single-class (Open Q2).

---

## CH4 — Per-write-class version tokens survive onto `entity`; the class becomes a Writer/action fact · **Settled** (amends D12)

**Decision.** `identityVersion`/`vitalsVersion`/`inventoryVersion`/
`progressionVersion` carry over as columns. `EDIT_SURFACE_CLASS` (a
surface→class map both layers must consult) is replaced by `durableClass`
declared on each Writer registry entry / column-action definition.

**Why D12 is amended, not followed.** D12's single-`version`-plus-field-merge
was written when "combat churn lives off the durable row" was the whole story.
But the per-class tokens protect an *intra-character* race (debounced narrative
save vs vitals click — UNN-140's founding bug), which combat's relocation
doesn't touch; and the mitigation D12 waves at (server-side merge +
reapply-on-stale) is unbuilt machinery strictly more complex than four int
columns. Decisive: the **as-built** combat router already assumes classes —
`entityRowStore(entityId, durableClass)` and the UNN-530 composite fold reading
durable `vitalsVersion`s. Following D12 would mean rebuilding shipped combat
plumbing to gain a merge engine nobody asked for.

**Why the class moves onto the write definition.** v1 resolved the class twice
(client hook + server wrapper) from a shared map — one source of truth, two
lookups. A descriptor write carries its Writer; the Writer carries its class —
the distinction is decided once where the write is *defined* (Code Style #9:
resolved into a shape, not re-read). Class assignments themselves (currency →
`inventory`, etc.) carry over unchanged; those were deliberate product calls.

---

## CH5 — One durable write factory: CD18–CD20 generalized; patches widen to entity-level; module re-homes to `lib/entity/commit` · **Settled**

**Decision.** ADR §2.4. Descriptor → Writer → `entityRowStore` for every
durable component write, app-wide; Writer patches become
`Partial<StoredComponents>`; optimistic predictors ride Writers; app-column
writes remain classic per-field actions; the neutral module lifts out of
`lib/combat/commit/`.

**Why the widening.** Combat's per-component patch was an honest description of
combat's writes. Characters have real multi-component transitions (Rest:
vitals + skillPool + resources + exhaustion). Options were (a) widen the patch,
(b) carve Rest out the way form-swap was carved out of combat's router (CD19).
Form-swap was carved out because it's an *entity transform* (`applyForm`), a
different species; Rest is plain component patching that happens to span keys —
same species, wider footprint. Carving it out would fork the write architecture
on footprint, not kind (the multiplicity smell). The invariant that matters —
**one version class per descriptor** — survives the widening and stays
registry-enforced.

**Why two write species is not a forked architecture.** Component-vs-column is
the D35 storage projection surfacing at the write layer; the fork is decided
once at the storage boundary (is this engine state?) and each species is
internally uniform. The alternative — forcing narrative text through Writers —
would put app content in the engine's registry to satisfy symmetry
(anticipatory uniformity, the F4 flavor).

**Lineage.** Same Abstract Factory + Strategy shape as CD19; the sheet's
`useEntityWrite` is the durable-only projection of `useCombatantWrite`'s
client half (predict → dispatch → reconcile). Whether the console's hook
becomes a wrapper over the shared one is Open Q5 — decided when both exist,
not speculatively.

**Sketch** (added 2026-07-05, Jackson's ask — the pattern is load-bearing and
new to the codebase): [`write-factory.example.ts`](./write-factory.example.ts),
grounded in the as-built combat router and annotated with which CH decision
each delta comes from.

---

## CH6 — Combat repoints at S0; encounters wiped; the two-worlds alternative rejected · **Settled**

**Decision.** All seven coupling touchpoints (ADR §2.5 table) repoint in the
foundation slice; existing encounters are wiped (UNN-535 precedent); v1
characters become combat-orphaned immediately and the app runs a short degraded
window (no durable PCs) until S1/S2 land.

**Why.** The alternative — run **two durable worlds** (combat reads
`characters` until the sheet slice, then repoint) — keeps prod fully live but
means every combat loader/write must resolve which world a durable id lives in
for the whole program: the storage-home distinction reborn as a *table*
distinction, re-read at every boundary (the F1 pattern, one level down). It
also makes S2 a mega-slice (sheet + all repoints at once). Repointing once at
S0, when the entity world is empty, is the cheapest possible moment: no data
to migrate, no dual resolution ever exists, every later slice is pure UI.
Expendable data + demonstrated slice cadence (PR11a/b/c landed within days)
makes the degraded window an acceptable price. The e2e encounter factory
mints entities from S0, so CI never enters the window.

---

## CH7 — Read model: per-surface view models from read-units; one load boundary; no `HydratedCharacter` successor · **Settled** (rejects the port roadmap's Decision A)

**Decision.** ADR §2.6. The loader returns `{ profile, resolved }` derived
once; pure per-surface builders in `apps/web/lib/character/view/` shape it;
shared slices only when two surfaces genuinely co-render one (combat-kit
precedent); view types named for content, never storage.

**Why the god-DTO stays dead.** The port roadmap's "re-home
`HydratedCharacter` verbatim as an app view-model" was defensible *under
port-in-place* (don't churn 70 components twice). Under vertical slices the
components are being rebuilt anyway — preserving the DTO would rebuild the new
surfaces around the old worldview (anti-goal 3) and re-centralize every tab's
needs into one flat bag whose every field every consumer type-depends on
(the lingua-franca coupling D30 rejects at the engine tier). The combat kit
already proved the alternative at scale: five view builders, zero shared
flattener, one deliberate shared slice.

**The F1 tripwire, stated for reviewers.** A view type carrying a storage-tier
discriminant (`durable`, `row`, `DurableHydration`) is the kind-branch
resurfacing in display clothes — split the write-token from the display
content and capability-resolve the display (the UNN-538 lesson, generalized).

---

## CH8 — Out-of-encounter Ailments/BattleConditions tracking is dropped; partyComposition derives or is absent · **Settled** (product call, Jackson 2026-07-04)

**Decision.** No durable twins, no schema-default accident: the feature is
deliberately removed. Ailments/BattleConditions live exclusively as encounter
overlay (the disjointness wall stands untouched). Exhaustion keeps its sheet
control (already durable). `partyComposition` storage dies; lineage-count
scalers resolve from the live roster in encounters and resolve partyless (count
0) on the standalone sheet.

**Why drop rather than re-model.** The standalone trackers are an artifact of
the v1 sheet doubling as the combat surface before encounters existed. Minting
durable sibling components (`lingeringAilments`) would preserve the feature at
the cost of two lifecycles for one concept plus a seeding story
(durable→overlay at combat start) — machinery whose only consumer is a
between-sessions bookkeeping habit the encounter tracker has since absorbed.
BattleConditions in particular is *lifecycle-divergent* from its durable shape
(the naive shape-diff passes while the semantics don't — HANDOFF verified
fact), so "just re-type it durable" was never actually cheap.

**Consequence owned.** Standalone attack-roll previews change: terms scaled by
party lineage counts read 0 outside an encounter (v1 let the stored column
inflate them). This is context-true — display copy may label the conditional
term — and it is a *derivation input* change on a preview, not a combat-math
change.

---

## CH9 — Creation rules are engine validators in existing domains + a finalize gate; drafts are entity rows · **Settled**

**Decision.** ADR §2.8: `progression/virtue-allocation.ts`, path stats from
the vitals domain, initiate gating from archetype tier vocab (all UNN-544);
draft = `status: 'draft'` entity row writing through the real factory from
step one; finalize = engine validation over the resolved entity + a status
flip.

**Why no `creation/` domain.** Creation rules are progression rules evaluated
at level 1 (allocation budgets, path choice, origin gating) — same vocabulary,
same domains. A `creation/` domain would duplicate the progression seam and
invite drift (the audit's reconciliation already landed here; kept). And
**drafts-as-entities** means the builder is not a parallel write world with a
conversion at the end — the mint boundary is a *validation* boundary, the
durable sibling of combat's session-factory (assemble components → one
boundary declares it playable).

**Rejected.** A draft-shaped DTO + convert-on-finalize — a second write
architecture for the same fields, plus a conversion function that is
`rawInputsToEntity` reborn at the builder's edge.

---

## CH10 — Talent/ailment content joins the engine catalog with display fields · **Settled** (reverses the earlier app-map routing)

**Decision.** ADR §2.9. Game content — keys, names, rules prose, future
mechanics — lives in `packages/game-v2/src/catalog/` (D32 pattern, as skills
already do). `labels.ts` keeps UI vocabulary only.

**Why reverse.** The "no engine display catalogs" policy, applied selectively,
produced two homes for one species: skill descriptions in the engine catalog,
talent descriptions in `apps/web/lib/ui/`. The species test (would this content
plausibly gain engine semantics? is it authored game content or UI wording?)
puts talents and ailments squarely with skills — ailments already *have* engine
semantics (Burn's end-of-turn tick). Deciding by species once beats deciding
per-catalog forever. The policy survives for what it was actually about:
UI-vocabulary label maps stay in the app.

---

## CH11 — Redesign scope: sheet + My Characters full; builder + Atlas keep their design · **Settled** (Jackson 2026-07-04; amends HANDOFF's "builder confirmed")

**Decision.** All four surfaces rebuild on v2 shapes; the Showtime! visual
redesign applies to the character sheet and My Characters. Jackson is happy
with the builder and Atlas designs — they keep their information architecture
and styling, swapping only their data spine (and the Atlas write shape:
rank-up by archetype key).

**Why fuse redesign with rebuild at all.** Building a surface to pixel-parity
on new shapes, then redesigning it, touches every component twice and tempts
contract preservation (the PR11a failure). One build per surface.

---

## CH12 — Sequencing: S0 foundation → S1 builder → S2 sheet → S3 My Characters + Atlas → S4 retirement → S5 rename · **Settled**

**Decision.** ADR §4. Builder before sheet (Jackson 2026-07-04).

**Why builder-first.** Fresh-start makes creation the bottleneck: until the
builder ships, the entity world is seed-data only. The builder also forces the
creation-rules engine gap (UNN-544) closed early, and every later slice then
develops against organically-minted characters. Sheet-first was the
read-model-proving alternative; it loses because its proving data would be
synthetic and its landing wouldn't unblock anything.

**Why My Characters after the sheet.** The list links to sheets; shipping the
redesigned list while it links into the old sheet ships a brand seam
mid-journey. Atlas re-points ride the same slice (small, and its write-shape
change wants the write factory battle-tested).

---

## CH13 — `@workspace/game-v2` renames to `@workspace/game` after v1 dies · **Settled** (Jackson 2026-07-04)

One mechanical PR at S5. "-v2" is a vestigial suffix the moment there is no v1
(honest-names rule); keeping it would encode a dead distinction in every import
forever.

---

## CH14 — Test strategy: inherited gates + pinned-fixture flip at oracle death · **Settled**

**Decision.** ADR §4: conformance test (table↔component), creation mint
golden-master, case-for-case `rest`/`leveling` write tests (UNN-544), new e2e
per surface off the factory pattern, parity suites flip to pinned fixtures in
the PR that severs the last v1 oracle import (UNN-548 item 10 procedure —
written to be roadmap-independent, reused verbatim). CI unit-test gate
recommended as a separate ticket (Open Q4).

**Why the flip is at oracle death, not per-slice.** While v1 code exists the
live oracle is strictly stronger than a snapshot; pinning early would discard
signal to save nothing.

---

## CH15 — Storage projection: one column per durable component, assembled into the bag at load · **Settled** (2026-07-05, Jackson's challenge; amends parent D11's "capability payloads in a `components` jsonb"; partially supersedes CH2's knives/chains + narrative-column reasoning; the app-column placement of narrative/knives/chains below is superseded by CH16 — they are a durable component)

**Decision.** The `entity` table carries one column per durable component key
(payload verbatim: jsonb for structured payloads, native scalar where the
payload is a bare scalar), `NULL ⇔ component absent` as the uniform
convention. The loader assembles non-null component columns into
`Entity.components` — CD14's assemble move generalized to the durable home;
runtime shapes, `resolve`, the descriptor router, and Writers are untouched (a
Writer patch's keys map 1:1 to SET columns). App content (narrative — pronouns
folded in — knives, chains) becomes sibling app-owned columns under the same
convention.

**The decisive argument: structural write disjointness.** Grilling the
one-bag design surfaced a latent hazard: `components` jsonb would hold all
four version classes, and class guards deliberately don't serialize across
classes — so two class-disjoint writes doing read-merge-write on the whole
document silently clobber each other. The one-bag mitigation is per-write-path
discipline (`jsonb_set` surgery, forever). Per-component columns make the
footprints disjoint **in the schema**: a plain `UPDATE SET vitals = …` cannot
touch `archetypes`. Structural safety, not vigilance (the CD1/CD3/CD14 value,
applied to DDL). Secondary gains: per-column types + Zod at load, readable
`psql`, per-component TOAST, migrations as visible history, and the
conformance test sharpens to column-set ↔ registry.

**Why the granule is the component, not the field.** v1's per-field flattening
(`virtueExpression int`, …) is not resurrected: the component is the granule
everything else keys on (capability presence, Writer patch, optimistic
prediction, version class), and field columns cannot express component
*absence* without an all-fields-null convention — the level smell again
(CH2's level addendum). Where a payload is a single scalar the column is
incidentally field-shaped; that's a coincidence of granules, not a rule
change.

**What this dissolves.**
- The narrative/knives/chains ownership question (the CH2→this-entry thread):
  no co-residence in one key space, so no disjointness machinery — app columns
  and engine component columns are collision-proof by column name. CH2's
  "narrative jsonb bag rejected for UNN-226 races" argument is **retracted**:
  the descriptor/per-field-action pattern server-merges under one class, and
  same-class writes serialize via the guard — the race belonged to v1's
  "client composes full post-state," not to jsonb residency.
- The surgical-jsonb-write obligation that the one-bag design would have added
  to S0.

**Costs owned.** A new durable component is an `ADD COLUMN` migration
(drizzle-kit one-liner; arguably good history). Durable rows and session blobs
now serialize components differently (columns vs inline bag) — accepted as
D11's existing durable/ephemeral projection split, resolved at the same single
loader boundary; nothing downstream sees either form.

**Rejected.**
- *One `components` jsonb bag* (parent D11's phrasing) — loses structural
  class disjointness; under-uses the relational engine for zero flexibility
  gain (the payloads are Zod-pinned either way; "no migration needed" buys
  little when drizzle-kit generates the migration).
- *Full per-field flattening* (v1's schema) — see granule argument; half the
  payloads (mechanic states, inheritance slots, spark log, affinity charts)
  are irreducibly structured and stay jsonb regardless.

---

## CH16 — `Narrative` is a durable engine component (rulebook content, engine-declared) · **Settled** (2026-07-05, Jackson's push; supersedes CH15's app-column placement; corrects CH2's classification)

**Decision.** One `Narrative` component — Ancestry, Background, Backstory,
Knives, Chains, Identity Traits (Personality / Hopes / Dreams / Fears /
Secrets) — declared in game-v2's durable registry, stored as one component
column (CH15), identity version class, written through the router (per-field
set ops + knife/chain list ops on the `narrative` Writer), surfaced to the app
as a pass-through read-unit on `ResolvedEntity` (the CD11 `identity`
precedent). `pronouns` and `notes` stay app-owned columns — the two content
fields that are genuinely not rulebook constructs.

**Why the ownership objection collapsed.** The objection ("the engine
shouldn't declare and Zod-validate prose it never reads") rested on
classifying these fields as app furniture. A rulebook check refuted the
classification: Knives/Chains are Character Building **1.4**, Identity Traits
are **1.5** — authored game vocabulary, which CH10's species test ("game
content lives in the game package") already claims for the engine catalog.
Two corroborating consumers make "never reads" doubtful anyway: "~7 Knives at
creation" is a countable creation constraint UNN-544's completeness validators
may read, and durable NPCs (CD7) are *built from* Knives/Chains/Identity
Traits per the NPC-design rules — the component is entity-content, not
PC-feature content. (Lesson re-learned, and it has a memory entry: check the
rulebook before classifying a sheet field's species.)

**What CH15 had already erased** (the sequence matters — this decision was
wrong to make before CH15 and right after it): the mechanical downsides of
component-izing narrative — cross-class jsonb clobber, co-residence
disjointness machinery, merge-race hazards — all died with per-component
columns. What remained was purely the declaration-ownership question, and the
rulebook settled it.

**Boundaries pinned so this doesn't creep.**
- `narrative` never enters the combat projection: not a `ResolvedComponentRegistry`
  combat read-unit row, never in the encounter snapshot. Owner-vs-public
  gating of Secrets on the sheet is the app read boundary's job, not the
  visibility table's.
- Conformance carve-out: the one component column with no `rawInputsToEntity`
  precedent; schema authored fresh from the v1 columns' shapes.
- The species line stands for future fields: rulebook construct → component;
  app furniture (pronouns, notes) → app column. Decide by the rulebook, not by
  whether the resolver reads it today.

---

## CH17 — `Virtues` is a durable component; v1's two-class virtue-write split collapses to progression · **Settled** (2026-07-05)

**Decision.** One `virtues` component column ({ expression, empathy, wisdom,
focus } ranks), progression version class.

**Why it's a decision and not housekeeping.** The four Virtue ranks had **no
v2 home**: `rawInputsToEntity` never projected them (UNN-533 left them
`CharacterRow` passthrough — they don't feed the attribute fold, so no
derivation consumer forced the issue). The fresh-start table would have
silently dropped them. Jackson flagged it during the open-items pass. The
engine consumers are real and already ticketed: UNN-544's `rankUpVirtue` /
`eligibleVirtuesForRankUp` / creation allocation validators all read+write
this component; SparkLog (v1 carry, verified against rulebook 1.2: capacity
7, forced rank-up at 7, log clears on rank-up — never on rest) sits beside it.
The rulebook independently corroborates the component shape: "All sapient
characters, **which can include some monsters**, have four social Virtues"
(1.2) — Virtues are capability-presence *by rule* (a goblin NPC may carry
them; a wolf doesn't), which a component expresses structurally and a
PC-scoped column never could.

**The class collapse (small SUPERSEDE).** v1 split virtue writes across two
classes: builder `virtuesAllocation` (identity) vs sheet `virtueRankUp`
(progression). Under CH4 the class is a fact of the Writer, and one component
takes one class — **progression** wins (the live sheet surface; builder-time
allocation contends with nothing). The v1 split protected surfaces that never
actually race.

**Amendment (E1 — UNN-552, 2026-07-06): `Virtues` and `SparkLog` are ONE
component, not two.** S0 minted them as two durable components/columns (`virtues`
ranks + `sparkLog`). Jackson flagged the split during E1 as a leak: you never
have ranks without a log or a log without ranks, and `rankUpVirtue` reads and
writes **both atomically** — the textbook granularity signal for a single
component (O1/D8, "the smallest cluster one system reads/writes together"). v1
itself modeled them as one interface (`SparkCharacter { sparkLog, virtues }`), so
the S0 split was the deviation. They already share the write class (progression),
combat treatment (`DROP_FROM_ALL`), and PC-only lifecycle — nothing argued for
two. Merged to `virtues = { ranks, sparkLog }`, homed in its own `virtues/`
domain folder (out of `progression/`); the `entity.sparkLog` column is dropped
(migration 0028). One column → one progression guard/token covers both the
`addSpark` and `rankUpVirtue` writes.

---

## CH18 — Optimistic frames run `resolveEntity` on the client, uniformly · **Settled** (2026-07-05; Jackson's lean, sharpened)

**Decision.** The sheet's optimistic dispatch is `applyOp` → merge patch →
**client-side `resolveEntity`** → optimistic frame, for every write. One
strategy, no per-write special cases.

**Why it's forced, not just preferred.** v1's precedent ("the pure engine is
client-shipped; optimistic frames use the same pure function the server
persists with" — `actions/CLAUDE.md`'s no-drift property) is real but
incomplete: v1's most-clicked optimistic control (pool clicks) never needed
derivation because absolute storage made `currentHP` *authored*. CH3's
depletion model makes it *derived* — so without a client fold, the revalidate
lag would regress the sheet's hottest control relative to v1. CH3 implies
CH18.

**The rejected middle path (named so it stays rejected).** Predict depletion
writes with cheap algebra (`currentHP = maxHP − damage'`; maxes unchanged) and
re-fold only for structural writes (equip, archetype switch). Faster, mostly
correct, and exactly the anti-pattern: it hand-encodes a fold fact ("damage
doesn't move the ceiling") outside the fold and splits one optimistic strategy
into two decided-per-surface variants. Uniform re-fold is the simple thing
that is always correct.

**Costs + constraints owned.**
- Bundle: the fold + the catalog slices the layers read — largely already paid
  (v1 ships its engine to the client today; UNN-535's console ships v2 pure
  code for its optimistic path; `optimizePackageImports` is wired).
- RSC split: optimistic surfaces are client islands holding
  `(entity, resolved, dispatch)`; prose surfaces (Explore) stay
  server-rendered. The shell PR draws this line deliberately.
- Context parity: the client re-fold uses the same `ResolveContext` as the
  server — ambient/empty out of encounter; in-encounter PC writes ride
  combat's console path, which already injects context.
- Q5 interplay: both hooks now want "predict via Writer → merge → re-fold" —
  convergence more likely, still deferred to S2.

---

## CH19 — Ticket disposition: cancel-and-rewrite; the fresh-start premise applies to tickets · **Settled** (2026-07-05, Jackson's call; resolves the deferred UNN-544-split question)

**Decision.** Pre-pivot character-domain tickets (UNN-511, 539, 544,
543/545/546/548/549) are canceled with linking comments; the program's slate
is written fresh from this ADR (S0, E1–E3, S1, design spike, S2×4, S3, S4,
S5 — ADR §4). UNN-510 closes as superseded-for-its-remainder. Combat/spatial
tickets (540/547/521/531/537/541/542) are untouched; UNN-538 survives with a
text review (pre-pivot `HydratedSkill[]` framing).

**Why.** A ticket is a contract with its implementer — here usually a fresh
session that treats ticket text as ground truth. Amending pre-pivot prose is
the anti-goal-3 failure mode ("preserve the old contract, bill an adapter")
applied to process artifacts: a vestigial sentence ("landed last", "the
`components` jsonb", "single version") produces a confidently-wrong
implementation. The same premise change that made storage fresh-start makes
the tickets fresh-start.

**Discipline: copy, don't reference.** The canceled tickets carry verified
investigation findings (esp. 544/545/546/548). Each new ticket copies what it
needs into its own description; an implementer must never need to open a
canceled ticket. Splitting old UNN-544 into E1 (creation/progression
transitions, blocks S1) / E2 (rest engine, blocks S2-shell) / E3 (CH10
catalog moves, blocks S2's content tabs) falls out of drawing the fresh
tickets along the dependency graph instead of along the old wave graph — the
deferred "split UNN-544" question dissolves rather than getting answered.
Schema-vs-transition seam: new component *schemas* (virtues/narrative/
sparkLog) ride S0 (the conformance test needs them at table creation); the
pure *transitions* ride E1/E2.

---

## CH20 — The home fork (durable vs inline) is the *other* factory: decided at mint, derived at two boundaries, invisible to the UI; character surfaces have no fork by design · **Settled** (2026-07-05, Jackson's probe)

**The probe.** Reviewing the write-factory sketch, Jackson flagged that it
shows only the per-component factory (Writers) — his deeper concern was the
durable-vs-ephemeral factory: "some entities live on the session vs have their
own durable rows, but they're both still entities," and the UI must never
decide which (Code Style #9).

**The answer, made explicit.** The write architecture is two orthogonal
factories:

- **Factory 1 — Writer registry (WHAT):** per-component pure ops, shared by
  every surface (CH5; the sketch).
- **Factory 2 — Store selection (WHERE):** durable row vs session blob —
  **already shipped** as combat's `storeFor` (UNN-520; CD18/CD19).

The #9 anatomy of the home distinction, stated precisely so reviewers can
check it:

1. **Decided once, at participant mint.** A setup entry persists as
   `{ storage: 'durable', entityId }` or `{ storage: 'inline', entity }`. The
   stored *shape* is the decision (CD3-tightened: "derived, not a tag") — it
   cannot be re-decided downstream, only derived from.
2. **Derived at exactly the two boundaries that need it.** `storeFor`
   (server) derives the Store + auth gate from the locator's shape; the
   console's optimistic client derives its prediction strategy
   (reduce-session-locally vs patch-entity-and-re-fold) from the same fact in
   its own view. Two readers of one fact ≠ two decisions — *deciding once is
   not reading once*; neither boundary holds policy, both hold projection.
3. **Unrepresentable to the UI.** Descriptors carry no storage field; a wire
   claim could not be honored even if forged.

**Why the characters ADR shows no fork — the principle working, not a gap.**
The fork exists only where the two homes coexist: inside an encounter.
Outside one there is no session to hold an inline entity — a character
route's load boundary addresses a durable row *by construction*, so
`applyEntityWriteAction` composes `Writer ∘ entityRowStore` with no branch.
Adding a home check at the sheet's door would **re-decide a distinction
already resolved upstream** — the exact multiplicity smell #9 names. A
single-home door downstream of the deciding boundary is what "decided once"
looks like from below.

**Widget blindness rule (pinned for the S2/S3 component work).** A
write-capable component receives `dispatch` from its surface's provider
(`useEntityWrite` on character routes, `useCombatantWrite` in encounters) and
never imports a Server Action. The *door* is chosen once per surface at its
composition root; the *home* once per participant at mint; the widget knows
neither. This is what keeps future sheet↔console component sharing (e.g. the
drawer rendering sheet slices) from smuggling the fork into render code.

**Refinement (same session, Jackson's push): one pipeline, two doors —
combat's door is an address adapter, and no sibling factory survives S0.**
"One way to write to an entity" is made literal: ONE descriptor vocabulary
(`combatantWriteSchema` becomes the encounter-wire *subset* of
`entityWriteSchema`, deleting the parallel type), ONE Writer registry
(combat's built `COMPONENT_WRITERS` absorb into `ENTITY_WRITERS` as the
conforming subset), ONE durable Store (`entityRowStore` — combat's durable
arm forwards to the exact composition the sheet uses), ONE optimistic
predictor + re-fold. The two *doors* persist only because the address types
differ irreducibly — `entityId` vs `(encounterId, participantId)`; an inline
participant is unaddressable outside its session, and the encounter door owns
DM auth + the session version token. Merging them into one action with a
`target` union was considered and **rejected**: "through an encounter or
direct" is not a decision any code makes (it's a fact of the caller's load
boundary — a sheet has no `encounterId`), so a merged door would centralize
nothing: every caller still selects the union arm, and the auth fork moves
inside. Two branchless single-purpose doors beat one door with a branch. The
pipeline is kind-blind throughout — PC vs NPC is read by nothing, so "whatever
else" (a durable-NPC editor, a campaign-planning surface) is a new provider
bound to the entity door, not new machinery.

---

## Open questions — resolutions (2026-07-05, Jackson)

| # | Question | Resolution |
| --- | --- | --- |
| Q1 | Sheet slice decomposition | **Shell PR + one PR per tab** (Combat/Explore/Inventory/Archetypes IA kept); shell bundles the load boundary, old-sheet deletion, and the Combat tab — ADR §4 S2 |
| Q2 | Level-up restore rule (CH3 rider) | **No auto-restore** (rules call): `damage` persists, current rises by the max delta — CH3 closed |
| Q3 | SparkLog capacity/retention | **v1 semantics carry** — verified vs rulebook 1.2: capacity 7, `log-full` refusal, clears on **rank-up** (NOT on rest; first gloss wrongly borrowed the action log's clear-on-Full-Rest, corrected 2026-07-05); surfaced the CH17 `Virtues` gap |
| Q4 | CI unit-test-gate ticket | **Filed: UNN-550** (Infrastructure) |
| Q5 | `useEntityWrite` / `useCombatantWrite` convergence | **Deliberately deferred to S2** — hooks may ship independent and converge later without breaking either wire |
