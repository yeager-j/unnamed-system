import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { applyUsePrisma } from "@workspace/game-v2/resources/operations"
import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
} from "@workspace/game-v2/vitals/operations"

import type { VersionClass } from "@/lib/db/version-classes"

import type { EntityWrite, MechanicWrite, PoolWrite } from "./write.schema"

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
 * {@link WriterDeps} carries the resolved values a validation needs (Prisma's
 * cap). **Derived independently by client (from its view model) and server (from
 * its own resolve); never accepted over the wire** — a client could otherwise lie
 * about its caps.
 */
export interface WriterDeps {
  /** The resolved Prisma charge cap; `undefined` while the max is unknown. */
  maxPrisma?: number
}

/** A Writer's refusal — surfaced by the action, never silently dropped. */
export type EntityWriteRefusal =
  | "capability-missing"
  | "no-prisma-max"
  | "no-prisma-charges"
  | "no-transitions"

/**
 * The authored-component patch a Writer predicts — whole updated components, so
 * the optimistic frame merges + re-resolves exactly like a server read. Widened
 * to the durable registry (CH5): a character transition (Rest) spans vitals +
 * skillPool + resources + exhaustion in one patch. Each patch key maps 1:1 to an
 * `entity` component column, so the guarded UPDATE touches exactly the written
 * components. The combat Writers below produce the single-component degenerate
 * case of this type.
 *
 * `identity`/`presentation` are excluded: the descriptor router never writes the
 * `name`/`portraitUrl` metadata — those are classic per-field column actions
 * (ADR §2.4) — so a router patch spans only durable **component** columns.
 */
export type EntityWritePatch = Partial<
  Omit<ComponentRegistry, "identity" | "presentation">
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
    write: W,
    deps: WriterDeps
  ): Result<EntityWritePatch, EntityWriteRefusal>
}

// The pools arm is ONE union member covering both components, so a naive
// per-key Extract would collapse to `never` — the two pool entries share it.
type WriterMap = {
  vitals: EntityWriter<PoolWrite>
  skillPool: EntityWriter<PoolWrite>
  resources: EntityWriter<Extract<EntityWrite, { component: "resources" }>>
  mechanics: EntityWriter<MechanicWrite>
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
    applyOp(components, _write, deps) {
      const resources = components.resources
      if (resources === undefined) return err("capability-missing")
      if (deps.maxPrisma === undefined) return err("no-prisma-max")
      const used = applyUsePrisma(resources, deps.maxPrisma)
      if (!used.ok) return used
      return ok({ resources: { ...resources, ...used.value } })
    },
  },
  mechanics: {
    component: "mechanics",
    durableClass: "vitals",
    applyOp(components, write) {
      const mechanics = components.mechanics
      const current = mechanics?.states[write.mechanic]
      if (mechanics === undefined || current === undefined) {
        return err("capability-missing")
      }
      const transitions = getMechanic(write.mechanic)?.transitions
      if (transitions === undefined) return err("no-transitions")
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
}

/**
 * The correlated dispatch over {@link ENTITY_WRITERS} — the single entry point
 * both the optimistic client and the server Store call, so the component-to-Writer
 * pairing is decided once with exact narrowing.
 */
export function applyEntityWrite(
  components: Components,
  write: EntityWrite,
  deps: WriterDeps
): Result<EntityWritePatch, EntityWriteRefusal> {
  switch (write.component) {
    case "vitals":
      return ENTITY_WRITERS.vitals.applyOp(components, write, deps)
    case "skillPool":
      return ENTITY_WRITERS.skillPool.applyOp(components, write, deps)
    case "resources":
      return ENTITY_WRITERS.resources.applyOp(components, write, deps)
    case "mechanics":
      return ENTITY_WRITERS.mechanics.applyOp(components, write, deps)
  }
}
