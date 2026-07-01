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

import type { CombatantWrite, MechanicWrite, PoolWrite } from "./write.schema"

/**
 * The **Writers** (UNN-520; ADR §2.9) — the storage-blind half of the
 * write-router. One entry per write-side component family, each wrapping the
 * engine's existing pure operations. `applyOp` is:
 *
 * - the **optimistic client predictor** — the deferred `useCombatantWrite`
 *   hook applies the returned patch to its latest optimistic frame (reducer-form
 *   `useOptimistic`, the UNN-226 stale-closure lesson), and
 * - the **session arm's validation pre-mint** — the server runs it before
 *   minting the reducer event, so a capability miss or an unaffordable spend is
 *   a real error at the boundary rather than a silent reducer no-op. (The
 *   durable arm validates inside its per-field wrappers instead — each home
 *   commits natively, amended CD19.)
 *
 * {@link WriterDeps} carries the resolved values a validation needs (Prisma's
 * cap). **Derived independently by client (from its view model) and server
 * (from its own resolve); never accepted over the wire** — a client could
 * otherwise lie about its caps.
 */
export interface WriterDeps {
  /** The resolved Prisma charge cap; `undefined` while the max is unknown. */
  maxPrisma?: number
}

/** A Writer's refusal — surfaced by the action, never silently dropped. */
export type CombatantWriteRefusal =
  | "capability-missing"
  | "no-prisma-max"
  | "no-prisma-charges"
  | "no-transitions"

/**
 * The authored-component patch a Writer predicts — whole updated components,
 * so the optimistic frame merges + re-resolves exactly like a server read.
 */
export type CombatantWritePatch = Partial<
  Pick<ComponentRegistry, "vitals" | "skillPool" | "resources" | "mechanics">
>

type Components = Partial<ComponentRegistry>

export interface ComponentWriter<W extends CombatantWrite = CombatantWrite> {
  component: W["component"]
  /** The character version class every durable commit of this family guards on. */
  durableClass: "vitals"
  applyOp(
    components: Components,
    write: W,
    deps: WriterDeps
  ): Result<CombatantWritePatch, CombatantWriteRefusal>
}

// The pools arm is ONE union member covering both components, so a naive
// per-key Extract would collapse to `never` — the two pool entries share it.
type WriterMap = {
  vitals: ComponentWriter<PoolWrite>
  skillPool: ComponentWriter<PoolWrite>
  resources: ComponentWriter<
    Extract<CombatantWrite, { component: "resources" }>
  >
  mechanics: ComponentWriter<MechanicWrite>
}

/**
 * One Writer per component family. `vitals` and `skillPool` share their op
 * vocabulary but operate on different component types through different
 * engine operations — two entries varying the noun, one shape.
 */
export const COMPONENT_WRITERS: WriterMap = {
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
 * The correlated dispatch over {@link COMPONENT_WRITERS} — the single entry
 * point both the optimistic client and the session store call, so the
 * component-to-Writer pairing is decided once with exact narrowing.
 */
export function applyCombatantWrite(
  components: Components,
  write: CombatantWrite,
  deps: WriterDeps
): Result<CombatantWritePatch, CombatantWriteRefusal> {
  switch (write.component) {
    case "vitals":
      return COMPONENT_WRITERS.vitals.applyOp(components, write, deps)
    case "skillPool":
      return COMPONENT_WRITERS.skillPool.applyOp(components, write, deps)
    case "resources":
      return COMPONENT_WRITERS.resources.applyOp(components, write, deps)
    case "mechanics":
      return COMPONENT_WRITERS.mechanics.applyOp(components, write, deps)
  }
}
