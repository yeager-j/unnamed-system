import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { emptyNarrative } from "@workspace/game-v2/narrative"
import {
  applyAwardVictory,
  applyLevelUp,
  applyRemoveVictory,
} from "@workspace/game-v2/progression/leveling"
import { PRISMA_BASE_CHARGES } from "@workspace/game-v2/resources/derive"
import { applyUsePrisma } from "@workspace/game-v2/resources/operations"
import {
  applyFullRest,
  applyPartialRest,
  applyRespite,
  type RestComponents,
} from "@workspace/game-v2/resources/rest"
import {
  addSpark,
  coerceVirtueAllocation,
  exceedsAllocationCap,
  rankUpVirtue,
} from "@workspace/game-v2/virtues"
import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
} from "@workspace/game-v2/vitals/operations"

import type { VersionClass } from "@/lib/db/version-classes"
import {
  applySetInheritanceSlot,
  applySetOrigin,
  applySpendArchetypeRank,
} from "@/lib/game-engine-v2"
import type { LiftedComponentKey } from "@/lib/game-v2/entity-row-to-bag"

import {
  equipmentWriter,
  type EquipmentWrite,
  type InventoryWriteRefusal,
} from "./arms/inventory"
import type {
  ArchetypesWrite,
  EntityWrite,
  ExhaustionWrite,
  LevelWrite,
  MechanicWrite,
  NarrativeWrite,
  PathWrite,
  PoolWrite,
  RestWrite,
  TalentsWrite,
  VirtuesWrite,
} from "./write.schema"

/**
 * The **Writers** (UNN-520/UNN-551; ADR §2.4/§2.9) — the storage-blind half of
 * the write pipeline, shared by every surface that writes a durable entity (the
 * character sheet, the builder, and combat's durable arm). One entry per
 * write-side component family, each wrapping the engine's pure operations.
 * `applyOp` is:
 *
 * - the **optimistic client predictor** — the dispatching hook applies the
 *   returned patch to its latest optimistic frame (reducer-form `useOptimistic`,
 *   the UNN-226 stale-closure lesson), and
 * - the **server's validation pre-mint** — the Store runs it before committing,
 *   so a capability miss or an unaffordable spend is a real error at the boundary
 *   rather than a silent no-op.
 *
 * Validation inputs are the stored components themselves plus engine-derived
 * constants (the Prisma cap, dice maxima from `level`) — nothing is accepted
 * over the wire, and client prediction and server commit derive identically.
 */

/** A Writer's refusal — surfaced by the action, never silently dropped.
 *  The four Spark members mirror {@link SparkError} so the virtues Writer
 *  returns the engine's `Result` directly (the `applyUsePrisma` precedent);
 *  {@link InventoryWriteRefusal} folds in the item engine's refusals the same
 *  way (UNN-559). */
export type EntityWriteRefusal =
  | "capability-missing"
  | "no-prisma-charges"
  | "no-transitions"
  | "allocation-cap-exceeded"
  | "entry-not-found"
  | "not-unlocked"
  | "insufficient-skill-dice"
  | "insufficient-hit-dice"
  | "invalid-input"
  | "insufficient-victories"
  | "max-level"
  | "log-full"
  | "log-not-full"
  | "virtue-not-eligible"
  | "rank-capped"
  | "no-saved-ranks"
  | "prerequisites-not-met"
  | InventoryWriteRefusal

/**
 * The authored-component patch a Writer predicts — whole updated components, so
 * the optimistic frame merges + re-resolves exactly like a server read. Widened
 * to the durable registry (CH5): a character transition (Rest) spans vitals +
 * skillPool + resources + exhaustion in one patch. Each patch key maps 1:1 to an
 * `entity` component column, so the guarded UPDATE touches exactly the written
 * components. The combat Writers below produce the single-component degenerate
 * case of this type.
 *
 * The lifted components (`identity`/`presentation`) are excluded: the descriptor
 * router never writes the `name`/`portraitUrl` metadata — those are classic
 * per-field column actions (ADR §2.4) — so a router patch spans only durable
 * **component** columns.
 */
export type EntityWritePatch = Partial<
  Omit<ComponentRegistry, LiftedComponentKey>
>

type Components = Partial<ComponentRegistry>

export interface EntityWriter<W extends EntityWrite = EntityWrite> {
  component: W["component"]
  /**
   * The version class every durable commit of this family guards on — a fact of
   * the Writer (CH4), declared once and read by both the client (which token to
   * send) and the server (which token to bump). The combat families all guard
   * `vitals`; the character families that land later carry `identity` /
   * `progression`.
   */
  durableClass: VersionClass
  applyOp(
    components: Components,
    write: W
  ): Result<EntityWritePatch, EntityWriteRefusal>
}

// The pools arm is ONE union member covering both components, so a naive
// per-key Extract would collapse to `never` — the two pool entries share it.
type WriterMap = {
  vitals: EntityWriter<PoolWrite>
  skillPool: EntityWriter<PoolWrite>
  resources: EntityWriter<Extract<EntityWrite, { component: "resources" }>>
  mechanics: EntityWriter<MechanicWrite>
  rest: EntityWriter<RestWrite>
  exhaustion: EntityWriter<ExhaustionWrite>
  level: EntityWriter<LevelWrite>
  path: EntityWriter<PathWrite>
  archetypes: EntityWriter<ArchetypesWrite>
  talents: EntityWriter<TalentsWrite>
  virtues: EntityWriter<VirtuesWrite>
  narrative: EntityWriter<NarrativeWrite>
  equipment: EntityWriter<EquipmentWrite>
}

/**
 * One Writer per component family. `vitals` and `skillPool` share their op
 * vocabulary but operate on different component types through different engine
 * operations — two entries varying the noun, one shape. Combat's original
 * `COMPONENT_WRITERS` are absorbed here as the built subset.
 */
export const ENTITY_WRITERS: WriterMap = {
  vitals: {
    component: "vitals",
    durableClass: "vitals",
    applyOp(components, write) {
      const vitals = components.vitals
      if (vitals === undefined) return err("capability-missing")
      switch (write.op) {
        case "damage":
          return ok({
            vitals: { ...vitals, ...applyDamage(vitals, write.amount) },
          })
        case "heal":
          return ok({
            vitals: { ...vitals, ...applyHeal(vitals, write.amount) },
          })
        case "setMax":
          return ok({ vitals: { ...vitals, base: write.amount } })
      }
    },
  },
  skillPool: {
    component: "skillPool",
    durableClass: "vitals",
    applyOp(components, write) {
      const skillPool = components.skillPool
      if (skillPool === undefined) return err("capability-missing")
      switch (write.op) {
        case "damage":
          return ok({
            skillPool: {
              ...skillPool,
              ...applySpendSP(skillPool, write.amount),
            },
          })
        case "heal":
          return ok({
            skillPool: {
              ...skillPool,
              ...applyRecoverSP(skillPool, write.amount),
            },
          })
        case "setMax":
          return ok({ skillPool: { ...skillPool, base: write.amount } })
      }
    },
  },
  resources: {
    component: "resources",
    durableClass: "vitals",
    applyOp(components) {
      const resources = components.resources
      if (resources === undefined) return err("capability-missing")
      const used = applyUsePrisma(resources, PRISMA_BASE_CHARGES)
      if (!used.ok) return used
      return ok({ resources: { ...resources, ...used.value } })
    },
  },
  mechanics: {
    component: "mechanics",
    durableClass: "vitals",
    applyOp(components, write) {
      const mechanics = components.mechanics
      if (mechanics === undefined) return err("capability-missing")
      const definition = getMechanic(write.mechanic)
      const transitions = definition?.transitions
      if (definition === undefined || transitions === undefined) {
        return err("no-transitions")
      }
      // Mirror the read path (`getActiveMechanics`): an absent-but-owned state
      // reads as the mechanic's initial state, so the first write transitions
      // from exactly what the widget showed — finalize only seeds the Origin's
      // mechanic, and later roster entries have no stored state until touched.
      const current =
        mechanics.states[write.mechanic] ?? definition.initialState()
      return ok({
        mechanics: {
          states: {
            ...mechanics.states,
            [write.mechanic]: transitions.apply(current, write.transition),
          },
        },
      })
    },
  },

  // ── The character transitions (S2a — UNN-557): the sheet's rest / exhaustion /
  // victory-and-level writes over the E1/E2 engine transitions. ────────────────

  /**
   * The E2 rest trio — the multi-component write that forced the CH5 patch
   * widening. One descriptor, one `vitals`-class guard, one UPDATE spanning the
   * four columns (all vitals-class, so the footprint stays class-disjoint). The
   * engine already speaks the patch contract (whole updated components, 1:1
   * with columns — UNN-601), so its result is returned verbatim.
   */
  rest: {
    component: "rest",
    durableClass: "vitals",
    applyOp(components, write) {
      const { vitals, skillPool, resources, exhaustion, level } = components
      if (!vitals || !skillPool || !resources || !exhaustion || !level) {
        return err("capability-missing")
      }
      const resting: RestComponents = {
        vitals,
        skillPool,
        resources,
        exhaustion,
        level,
      }
      return write.op === "fullRest"
        ? ok(applyFullRest(resting))
        : write.op === "partialRest"
          ? applyPartialRest(resting, write)
          : applyRespite(resting, write)
    },
  },

  /** Direct Exhaustion tracking (D27) — the sheet's 0–6 stepper. */
  exhaustion: {
    component: "exhaustion",
    durableClass: "vitals",
    applyOp(components, write) {
      const exhaustion = components.exhaustion
      if (exhaustion === undefined) return err("capability-missing")
      return ok({ exhaustion: { ...exhaustion, level: write.level } })
    },
  },

  /**
   * Victories + level-up (rulebook 1.6). Level-up patches only progression-class
   * columns (`level`, `archetypes`) — the single-class write ADR §2.2 promises;
   * maxes rise by deriving from the new level, spends persist.
   */
  level: {
    component: "level",
    durableClass: "progression",
    applyOp(components, write) {
      const level = components.level
      if (level === undefined) return err("capability-missing")
      switch (write.op) {
        case "awardVictory":
          return ok({ level: applyAwardVictory(level) })
        case "removeVictory":
          return ok({ level: applyRemoveVictory(level) })
        case "levelUp": {
          const archetypes = components.archetypes
          if (archetypes === undefined) return err("capability-missing")
          return applyLevelUp({ level, archetypes })
        }
      }
    },
  },

  // ── The creation families (S1 — UNN-556). The builder's authored-choice
  // writes; each creates its component from absent, since a fresh draft mints
  // only the always-present skeleton (lib/entity/draft.ts). ──────────────────

  path: {
    component: "path",
    durableClass: "identity",
    applyOp: (_components, write) => ok({ path: { choice: write.choice } }),
  },

  /**
   * The archetype roster writes. `setActive` is a pure pointer move — re-point
   * `active` to an unlocked roster key (`not-unlocked` otherwise); ranks, slots,
   * and mechanic state ride the roster untouched. `setOrigin`,
   * `setInheritanceSlot`, and `spendArchetypeRank` are thin adapters over the
   * engine transitions that own their rulebook rules (game-v2 `archetypes/` —
   * UNN-595): capability check → transition → return. The transitions run
   * identically on the optimistic client and the server pre-mint.
   */
  archetypes: {
    component: "archetypes",
    durableClass: "progression",
    applyOp(components, write) {
      switch (write.op) {
        case "setOrigin":
          return applySetOrigin(components, write.archetypeKey)
        case "setActive": {
          const archetypes = components.archetypes
          if (archetypes === undefined) return err("capability-missing")
          if (
            !archetypes.roster.some((entry) => entry.key === write.archetypeKey)
          ) {
            return err("not-unlocked")
          }
          return ok({
            archetypes: { ...archetypes, active: write.archetypeKey },
          })
        }
        case "setInheritanceSlot": {
          const archetypes = components.archetypes
          if (archetypes === undefined) return err("capability-missing")
          return applySetInheritanceSlot({ archetypes }, write.archetypeKey, {
            slotIndex: write.slotIndex,
            sourceArchetypeKey: write.sourceArchetypeKey,
            skillKey: write.skillKey,
          })
        }
        case "spendArchetypeRank": {
          const archetypes = components.archetypes
          if (archetypes === undefined) return err("capability-missing")
          return applySpendArchetypeRank({ archetypes }, write.archetypeKey)
        }
      }
    },
  },

  /**
   * `setGained` — whole-list replace of the player-added Talents (the builder's
   * picker; cap + dedupe on the wire). `add`/`remove` — the sheet's per-entry
   * downtime-learning ops (S2b): add is idempotent (a double-click races itself
   * harmlessly) and creates-from-absent; remove refuses `entry-not-found` so a
   * raced remove surfaces instead of silently no-oping.
   */
  talents: {
    component: "talents",
    durableClass: "identity",
    applyOp(components, write) {
      switch (write.op) {
        case "setGained":
          return ok({ talents: write.keys.map((key) => ({ key })) })
        case "add": {
          const talents = components.talents ?? []
          if (talents.some((talent) => talent.key === write.key)) {
            return ok({ talents })
          }
          return ok({ talents: [...talents, { key: write.key }] })
        }
        case "remove": {
          const talents = components.talents ?? []
          if (!talents.some((talent) => talent.key === write.key)) {
            return err("entry-not-found")
          }
          return ok({
            talents: talents.filter((talent) => talent.key !== write.key),
          })
        }
      }
    },
  },

  /**
   * `setAllocation` — the creation allocation (rulebook 1.2). Refuses only the
   * cap (>1 Virtue at +2, >2 at +1) — partial mid-flow allocations are legal;
   * full validity is the step gate + finalize validator. The Spark log rides
   * along untouched.
   *
   * `addSpark` / `rankUp` — the Spark loop (S2b, rulebook 1.2) over the E1
   * transitions: the engine owns eligibility (Virtue in a *full* log), the
   * rank ceiling, and the log clearing on rank-up; its {@link SparkError}
   * refusals pass through unchanged (`log-full` is the sheet's forced-rank-up
   * prompt).
   */
  virtues: {
    component: "virtues",
    durableClass: "progression",
    applyOp(components, write) {
      switch (write.op) {
        case "setAllocation": {
          const ranks = coerceVirtueAllocation(write.ranks)
          if (exceedsAllocationCap(ranks)) {
            return err("allocation-cap-exceeded")
          }
          return ok({
            virtues: { ranks, sparkLog: components.virtues?.sparkLog ?? [] },
          })
        }
        case "addSpark": {
          const virtues = components.virtues
          if (virtues === undefined) return err("capability-missing")
          const next = addSpark(virtues, write.virtue)
          if (!next.ok) return next
          return ok({ virtues: next.value })
        }
        case "rankUp": {
          const virtues = components.virtues
          if (virtues === undefined) return err("capability-missing")
          const next = rankUpVirtue(virtues, write.virtue)
          if (!next.ok) return next
          return ok({ virtues: next.value })
        }
      }
    },
  },

  /**
   * Per-field prose sets + per-entry Knife/Chain list ops (CH16). An empty
   * string stores as `null` (text fields and entry descriptions) so the
   * payload stays canonical against the nullable schema. Entries address by
   * index — display order IS the array order (D36); an out-of-range index
   * refuses `entry-not-found` (a remove raced the edit).
   */
  narrative: {
    component: "narrative",
    durableClass: "identity",
    applyOp(components, write) {
      const base = components.narrative ?? emptyNarrative()
      switch (write.op) {
        case "setField":
          return ok({
            narrative: {
              ...base,
              [write.field]: write.value === "" ? null : write.value,
            },
          })
        case "addListEntry":
          return ok({
            narrative: {
              ...base,
              [write.list]: [
                ...base[write.list],
                { title: "", description: null },
              ],
            },
          })
        case "removeListEntry": {
          if (write.index >= base[write.list].length) {
            return err("entry-not-found")
          }
          return ok({
            narrative: {
              ...base,
              [write.list]: base[write.list].filter(
                (_entry, index) => index !== write.index
              ),
            },
          })
        }
        case "setListEntry": {
          const entry = base[write.list][write.index]
          if (entry === undefined) return err("entry-not-found")
          const value =
            write.field === "description" && write.value === ""
              ? null
              : write.value
          return ok({
            narrative: {
              ...base,
              [write.list]: base[write.list].map((existing, index) =>
                index === write.index
                  ? { ...existing, [write.field]: value }
                  : existing
              ),
            },
          })
        }
      }
    },
  },

  // The Inventory-tab family (S2c — UNN-559), the first arm sourced from a
  // per-domain module; dispatch composition stays here.
  equipment: equipmentWriter,
}

/**
 * The correlated dispatch over {@link ENTITY_WRITERS} — the single entry point
 * both the optimistic client and the server Store call, so the component-to-Writer
 * pairing is decided once with exact narrowing.
 */
export function applyEntityWrite(
  components: Components,
  write: EntityWrite
): Result<EntityWritePatch, EntityWriteRefusal> {
  switch (write.component) {
    case "vitals":
      return ENTITY_WRITERS.vitals.applyOp(components, write)
    case "skillPool":
      return ENTITY_WRITERS.skillPool.applyOp(components, write)
    case "resources":
      return ENTITY_WRITERS.resources.applyOp(components, write)
    case "mechanics":
      return ENTITY_WRITERS.mechanics.applyOp(components, write)
    case "rest":
      return ENTITY_WRITERS.rest.applyOp(components, write)
    case "exhaustion":
      return ENTITY_WRITERS.exhaustion.applyOp(components, write)
    case "level":
      return ENTITY_WRITERS.level.applyOp(components, write)
    case "path":
      return ENTITY_WRITERS.path.applyOp(components, write)
    case "archetypes":
      return ENTITY_WRITERS.archetypes.applyOp(components, write)
    case "talents":
      return ENTITY_WRITERS.talents.applyOp(components, write)
    case "virtues":
      return ENTITY_WRITERS.virtues.applyOp(components, write)
    case "narrative":
      return ENTITY_WRITERS.narrative.applyOp(components, write)
    case "equipment":
      return ENTITY_WRITERS.equipment.applyOp(components, write)
  }
}
