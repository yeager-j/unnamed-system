import { z } from "zod/v4"

import { PATH_CHOICES, VIRTUE_KEYS } from "@workspace/game-v2/kernel/vocab"
import { MECHANIC_KINDS } from "@workspace/game-v2/kernel/vocab/mechanics"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { NARRATIVE_TEXT_FIELDS } from "@workspace/game-v2/narrative"
import { MAX_EXHAUSTION_LEVEL } from "@workspace/game-v2/resources/exhaustion.schema"
import { MAX_PLAYER_ADDED_TALENTS } from "@workspace/game-v2/talents/vocab"

import {
  equipmentAddArm,
  equipmentCurrencyArm,
  equipmentItemOpArm,
  equipmentSetQuantityArm,
} from "./arms/inventory"

/**
 * The **serializable entity-write descriptor** (UNN-520/UNN-551/UNN-556; CD19) —
 * the one shape every durable-component write travels as, from the optimistic
 * client dispatch to the Server Action. It is the shared write vocabulary: the
 * character surfaces dispatch it to the entity door, and combat dispatches it to
 * the encounter door (which resolves the participant's home, then forwards a
 * durable write to the *same* Writers). There is no parallel "combatant write"
 * type — the encounter wire validates the {@link combatEntityWriteSchema} subset
 * directly.
 *
 * The families, one arm per write-side component:
 *
 * - `vitals` / `skillPool` — the depletion pools (`damage`/`heal`/`setMax`,
 *   positive amounts; each op owns its clamp).
 * - `resources` — consumable charges (`usePrisma`).
 * - `mechanics` — one mechanic-state transition, its `transition` payload
 *   validated **per-mechanic** against the registry's own `transitions.schema`
 *   (a mechanic that ships no write surface rejects here, at the boundary).
 * - `rest` / `exhaustion` / `level` — the sheet's character transitions (S2a,
 *   UNN-557): the E2 rest trio (a vitals-class multi-component patch),
 *   Exhaustion tracking, and Victories/level-up (a progression-class patch).
 * - `path` / `archetypes` / `talents` / `virtues` / `narrative` — the creation
 *   families (S1, UNN-556): the builder's authored-choice writes, plus the
 *   sheet's active-Archetype switch (`archetypes.setActive`), the Spark loop
 *   (`virtues.addSpark`/`rankUp`), and per-entry Talent learning
 *   (`talents.add`/`remove`) — the S2b Explore-tab writes. `narrative` is
 *   per-field set ops + per-entry Knife/Chain list ops (CH16) — a descriptor is
 *   structurally a per-field write, so "client composes the full post-state" is
 *   unrepresentable (UNN-226).
 * - `equipment` — the Inventory-tab family (S2c, UNN-559), sourced from the
 *   first per-domain arm module (`./arms/inventory`) and composed into this one
 *   union.
 *
 * **No storage field** — the entity's durable-vs-inline home is never on the
 * wire; the server derives it from the authoritative out-of-band locator map, so
 * a client claim could never be read. The descriptor is *what* to write; *where*
 * is the router's decision (ADR §2.4/§2.9).
 */

/**
 * The wire sanity bound on a pool write — the `equipmentAddArm.quantity` /
 * `equipmentCurrencyArm.amount` precedent. It keeps absurd magnitudes off the wire;
 * it is **not** what makes the stored depletion safe. `applyDamage`/`applySpendSP`
 * saturate at the safe-integer boundary their load schema admits, because the wire
 * bound constrains one write while the *stored* value it accumulates onto is
 * unbounded — a row written before this bound existed already carries a depletion
 * a single later write could push out of the domain. Defense lives at the op
 * (`vitals/operations.ts`), where the depletion law quantifies over it.
 *
 * The isomorphism law quantifies over exactly this arm's domain, so the bound stays
 * honest about what the door admits.
 */
export const MAX_POOL_AMOUNT = 9_999

const poolsArm = z.object({
  component: z.enum(["vitals", "skillPool"]),
  op: z.enum(["damage", "heal", "setMax"]),
  amount: z.number().int().positive().max(MAX_POOL_AMOUNT),
})

const resourcesArm = z.object({
  component: z.literal("resources"),
  op: z.literal("usePrisma"),
})

const diceSpend = z.number().int().nonnegative()

/**
 * The rest transitions (E2, rulebook 2.5) — the multi-component write that forced
 * the CH5 patch widening: one descriptor, one `vitals`-class guard, one UPDATE
 * spanning vitals/skillPool/resources/exhaustion. The dice bounds re-check the
 * engine's A8 guard for form-level error messages; the engine remains the
 * corruption backstop.
 */
const restFullArm = z.object({
  component: z.literal("rest"),
  op: z.literal("fullRest"),
})

const restPartialArm = z.object({
  component: z.literal("rest"),
  op: z.literal("partialRest"),
  skillDiceToSpend: diceSpend,
  rolled: diceSpend,
})

const restRespiteArm = z.object({
  component: z.literal("rest"),
  op: z.literal("respite"),
  hitDiceToSpend: diceSpend,
  rolled: diceSpend,
})

/** Direct Exhaustion tracking (0–6) — the sheet's stepper (D27 durable level). */
const exhaustionArm = z.object({
  component: z.literal("exhaustion"),
  op: z.literal("setLevel"),
  level: z.number().int().min(0).max(MAX_EXHAUSTION_LEVEL),
})

/**
 * Victory tracking + level-up (rulebook 1.6). Level-up is deliberately a
 * single-class write: it patches only progression-class columns
 * (`level` + `archetypes`) — vitals/dice rise by deriving from the new level.
 */
const levelArm = z.object({
  component: z.literal("level"),
  op: z.enum(["awardVictory", "removeVictory", "levelUp"]),
})

const mechanicsArm = z
  .object({
    component: z.literal("mechanics"),
    mechanic: z.enum(MECHANIC_KINDS),
    transition: z.unknown(),
  })
  .check((ctx) => {
    const write = ctx.value
    const transitions = getMechanic(write.mechanic)?.transitions
    if (!transitions) {
      ctx.issues.push({
        code: "custom",
        message: `mechanic ${write.mechanic} has no write surface`,
        input: write,
      })
      return
    }
    if (!transitions.schema.safeParse(write.transition).success) {
      ctx.issues.push({
        code: "custom",
        message: `invalid ${write.mechanic} transition descriptor`,
        input: write,
      })
    }
  })

const pathArm = z.object({
  component: z.literal("path"),
  op: z.literal("setChoice"),
  choice: z.enum(PATH_CHOICES),
})

/**
 * Selecting (or switching) the Origin Archetype. The key is deliberately not
 * catalog-validated on the wire — v1 parity; an unknown key simply never
 * resolves and surfaces at finalize as `no-origin-archetype`.
 */
const archetypesOriginArm = z.object({
  component: z.literal("archetypes"),
  op: z.literal("setOrigin"),
  archetypeKey: z.string().min(1),
})

/**
 * Switching the active Archetype (rulebook 1.3; the sheet rail's switcher). The
 * Writer refuses a key outside the unlocked roster; the Respite timing rule is
 * the table's to enforce, not the tracker's (v1 parity — ungated).
 */
const archetypesSetActiveArm = z.object({
  component: z.literal("archetypes"),
  op: z.literal("setActive"),
  archetypeKey: z.string().min(1),
})

/**
 * Configuring an Inheritance Slot on an unlocked Archetype (rulebook 1.3; the
 * sheet's Archetypes tab, S2d — UNN-560). `archetypeKey` is the **owner**
 * Archetype whose slot this is; `slotIndex` addresses one of its
 * catalog-granted slots. A non-null `sourceArchetypeKey` + `skillKey` fills the
 * slot with a Skill inherited from another unlocked Archetype; both `null`
 * clears it (one `op`, the empty state is a value — rule #9). The Writer is the
 * sole inheritability gate — the resolve fold (`inheritedSkills`) honors any
 * resolvable slot Skill without re-checking — so it validates owner/slot-bounds
 * and `isInheritableSkill` before persisting.
 */
const archetypesSetSlotArm = z.object({
  component: z.literal("archetypes"),
  op: z.literal("setInheritanceSlot"),
  archetypeKey: z.string().min(1),
  slotIndex: z.number().int().nonnegative(),
  sourceArchetypeKey: z.string().min(1).nullable(),
  skillKey: z.string().min(1).nullable(),
})

/**
 * Spending one Saved Archetype Rank on `archetypeKey` (the Lineage Atlas, S3 —
 * UNN-561). One op for both unlock and rank-up: the roster is the source of
 * truth for owned-ness, so the Writer decides — an un-owned key unlocks it at
 * Rank 1 (prerequisites permitting), an owned key ranks it up toward Mastery.
 * The restricted-Archetype allowlist is re-checked server-side at the entity
 * door (the pure Writer is catalog-only and runs on the client too).
 */
const archetypesSpendRankArm = z.object({
  component: z.literal("archetypes"),
  op: z.literal("spendArchetypeRank"),
  archetypeKey: z.string().min(1),
})

/** Whole-list replace of the player-added Talents (open-string keys, v2). */
const talentsArm = z
  .object({
    component: z.literal("talents"),
    op: z.literal("setGained"),
    keys: z.array(z.string().min(1)).max(MAX_PLAYER_ADDED_TALENTS),
  })
  .check((ctx) => {
    if (new Set(ctx.value.keys).size !== ctx.value.keys.length) {
      ctx.issues.push({
        code: "custom",
        message: "duplicate talent keys",
        input: ctx.value,
      })
    }
  })

/**
 * Per-entry Talent ops (S2b, the sheet's Add/Remove Talent controls). Not a
 * whole-list replace: N remove buttons plus an Add popover all write one
 * column, so composing the full list client-side is the UNN-226 clobber class.
 * Deliberately uncapped — {@link MAX_PLAYER_ADDED_TALENTS} is a *creation*
 * bound (the builder's `setGained` keeps it); the sheet's Add is the
 * downtime-learning surface (rulebook 2.1, five downtime slots per Talent).
 */
const talentsAddArm = z.object({
  component: z.literal("talents"),
  op: z.literal("add"),
  key: z.string().min(1),
})

const talentsRemoveArm = z.object({
  component: z.literal("talents"),
  op: z.literal("remove"),
  key: z.string().min(1),
})

const virtueRank = z.number().int().min(0).max(2)

/**
 * The builder's creation allocation (rulebook 1.2). The wire admits any
 * combination of {0, 1, 2} ranks — mid-flow partial allocations are legal — and
 * the Writer refuses only cap violations; full validity (exactly one +2, two
 * +1s) is the step gate + the finalize validator.
 */
const virtuesArm = z.object({
  component: z.literal("virtues"),
  op: z.literal("setAllocation"),
  ranks: z.object({
    expression: virtueRank,
    empathy: virtueRank,
    wisdom: virtueRank,
    focus: virtueRank,
  }),
})

/**
 * The Spark loop (S2b, rulebook 1.2): earning a Spark tagged with its Virtue,
 * and the forced rank-up once the log fills. The Writer wraps the E1 spark
 * transitions, so eligibility (Virtue in a full log) and the rank ceiling are
 * the engine's refusals — `log-full` on the 8th Spark is what the sheet
 * surfaces as the forced-rank-up prompt.
 */
const virtuesAddSparkArm = z.object({
  component: z.literal("virtues"),
  op: z.literal("addSpark"),
  virtue: z.enum(VIRTUE_KEYS),
})

const virtuesRankUpArm = z.object({
  component: z.literal("virtues"),
  op: z.literal("rankUp"),
  virtue: z.enum(VIRTUE_KEYS),
})

/** v1's server-side prose bound (`character-narrative` / identity traits). */
const NARRATIVE_TEXT_MAX = 8000
/** v1's Knife/Chain bounds (`named-entry-list` schemas). */
const BEAT_TITLE_MAX = 120
const BEAT_DESCRIPTION_MAX = 4000

const narrativeFieldArm = z.object({
  component: z.literal("narrative"),
  op: z.literal("setField"),
  field: z.enum(NARRATIVE_TEXT_FIELDS),
  value: z.string().max(NARRATIVE_TEXT_MAX),
})

/**
 * Per-entry Knife/Chain list ops. Deliberately NOT a whole-list replace: a
 * debounced title save and a sibling description save composing the full list
 * client-side would clobber each other — the UNN-226 failure class at list
 * granularity. Entries are addressed by index (display order IS the array
 * order, D36); the server merges against its own row.
 */
const narrativeAddEntryArm = z.object({
  component: z.literal("narrative"),
  op: z.literal("addListEntry"),
  list: z.enum(["knives", "chains"]),
})

const narrativeRemoveEntryArm = z.object({
  component: z.literal("narrative"),
  op: z.literal("removeListEntry"),
  list: z.enum(["knives", "chains"]),
  index: z.number().int().nonnegative(),
})

const narrativeSetEntryArm = z
  .object({
    component: z.literal("narrative"),
    op: z.literal("setListEntry"),
    list: z.enum(["knives", "chains"]),
    index: z.number().int().nonnegative(),
    field: z.enum(["title", "description"]),
    value: z.string().max(BEAT_DESCRIPTION_MAX),
  })
  .check((ctx) => {
    if (
      ctx.value.field === "title" &&
      ctx.value.value.length > BEAT_TITLE_MAX
    ) {
      ctx.issues.push({
        code: "custom",
        message: `title exceeds ${BEAT_TITLE_MAX} characters`,
        input: ctx.value,
      })
    }
  })

/**
 * The **combat-relevant subset** — the only vocabulary the encounter door
 * accepts (ADR §2.4). The character-only families (path, archetypes, talents,
 * virtues, narrative) are creation/identity state no combat surface writes;
 * keeping them off the encounter wire means a tampered console request cannot
 * reach them, and the subset is enforced by a schema-level rejection test.
 */
export const combatEntityWriteSchema = z.union([
  poolsArm,
  resourcesArm,
  mechanicsArm,
])

export type CombatEntityWrite = z.infer<typeof combatEntityWriteSchema>

export const entityWriteSchema = z.union([
  poolsArm,
  resourcesArm,
  mechanicsArm,
  restFullArm,
  restPartialArm,
  restRespiteArm,
  exhaustionArm,
  levelArm,
  pathArm,
  archetypesOriginArm,
  archetypesSetActiveArm,
  archetypesSetSlotArm,
  archetypesSpendRankArm,
  talentsArm,
  talentsAddArm,
  talentsRemoveArm,
  virtuesArm,
  virtuesAddSparkArm,
  virtuesRankUpArm,
  narrativeFieldArm,
  narrativeAddEntryArm,
  narrativeRemoveEntryArm,
  narrativeSetEntryArm,
  equipmentItemOpArm,
  equipmentAddArm,
  equipmentSetQuantityArm,
  equipmentCurrencyArm,
])

export type EntityWrite = z.infer<typeof entityWriteSchema>

/** The pools arm alone (the shape the vitals/skillPool Writers consume). */
export type PoolWrite = Extract<
  EntityWrite,
  { component: "vitals" | "skillPool" }
>

/** The mechanics arm alone. */
export type MechanicWrite = Extract<EntityWrite, { component: "mechanics" }>

/** The character-transition arms (S2a — UNN-557), one per Writer. */
export type RestWrite = Extract<EntityWrite, { component: "rest" }>
export type ExhaustionWrite = Extract<EntityWrite, { component: "exhaustion" }>
export type LevelWrite = Extract<EntityWrite, { component: "level" }>

/** The creation-family arms (UNN-556), one per Writer. */
export type PathWrite = Extract<EntityWrite, { component: "path" }>
export type ArchetypesWrite = Extract<EntityWrite, { component: "archetypes" }>
export type TalentsWrite = Extract<EntityWrite, { component: "talents" }>
export type VirtuesWrite = Extract<EntityWrite, { component: "virtues" }>
export type NarrativeWrite = Extract<EntityWrite, { component: "narrative" }>

/** The Inventory-tab arm (S2c — UNN-559), sourced from its arm module. */
export type { EquipmentWrite } from "./arms/inventory"
