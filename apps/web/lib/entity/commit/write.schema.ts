import { z } from "zod/v4"

import { PATH_CHOICES } from "@workspace/game-v2/kernel/vocab"
import { MECHANIC_KINDS } from "@workspace/game-v2/kernel/vocab/mechanics"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { NARRATIVE_TEXT_FIELDS } from "@workspace/game-v2/narrative"
import { MAX_PLAYER_ADDED_TALENTS } from "@workspace/game-v2/talents/vocab"

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
 * - `path` / `archetypes` / `talents` / `virtues` / `narrative` — the creation
 *   families (S1, UNN-556): the builder's authored-choice writes. `narrative` is
 *   per-field set ops + per-entry Knife/Chain list ops (CH16) — a descriptor is
 *   structurally a per-field write, so "client composes the full post-state" is
 *   unrepresentable (UNN-226).
 *
 * **No storage field** — the entity's durable-vs-inline home is never on the
 * wire; the server derives it from the authoritative out-of-band locator map, so
 * a client claim could never be read. The descriptor is *what* to write; *where*
 * is the router's decision (ADR §2.4/§2.9).
 */

const poolsArm = z.object({
  component: z.enum(["vitals", "skillPool"]),
  op: z.enum(["damage", "heal", "setMax"]),
  amount: z.number().int().positive(),
})

const resourcesArm = z.object({
  component: z.literal("resources"),
  op: z.literal("usePrisma"),
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
const archetypesArm = z.object({
  component: z.literal("archetypes"),
  op: z.literal("setOrigin"),
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

const narrativeFieldArm = z.object({
  component: z.literal("narrative"),
  op: z.literal("setField"),
  field: z.enum(NARRATIVE_TEXT_FIELDS),
  value: z.string(),
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

const narrativeSetEntryArm = z.object({
  component: z.literal("narrative"),
  op: z.literal("setListEntry"),
  list: z.enum(["knives", "chains"]),
  index: z.number().int().nonnegative(),
  field: z.enum(["title", "description"]),
  value: z.string(),
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
  pathArm,
  archetypesArm,
  talentsArm,
  virtuesArm,
  narrativeFieldArm,
  narrativeAddEntryArm,
  narrativeRemoveEntryArm,
  narrativeSetEntryArm,
])

export type EntityWrite = z.infer<typeof entityWriteSchema>

/** The pools arm alone (the shape the vitals/skillPool Writers consume). */
export type PoolWrite = Extract<
  EntityWrite,
  { component: "vitals" | "skillPool" }
>

/** The mechanics arm alone. */
export type MechanicWrite = Extract<EntityWrite, { component: "mechanics" }>

/** The creation-family arms (UNN-556), one per Writer. */
export type PathWrite = Extract<EntityWrite, { component: "path" }>
export type ArchetypesWrite = Extract<EntityWrite, { component: "archetypes" }>
export type TalentsWrite = Extract<EntityWrite, { component: "talents" }>
export type VirtuesWrite = Extract<EntityWrite, { component: "virtues" }>
export type NarrativeWrite = Extract<EntityWrite, { component: "narrative" }>
