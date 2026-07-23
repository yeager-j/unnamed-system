import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { PRISMA_BASE_CHARGES } from "@workspace/game-v2/resources/derive"
import { applyUsePrisma } from "@workspace/game-v2/resources/operations"
import {
  applyDamage,
  applyHeal,
  applyRecoverSP,
  applySpendSP,
} from "@workspace/game-v2/vitals/operations"
import { err, ok } from "@workspace/result"

import type { EntityWrite, MechanicWrite, PoolWrite } from "../write.schema"
import type { EntityWriter } from "../writers"

type Components = Partial<ComponentRegistry>

export const vitalsWriter: EntityWriter<PoolWrite> = {
  component: "vitals",
  durableClass: "vitals",
  applyOp(components, write) {
    const vitals = components.vitals
    if (vitals === undefined) return err("capability-missing")
    switch (write.op) {
      case "damage": {
        const patch = applyDamage(vitals, write.amount)
        return patch.ok ? ok({ vitals: { ...vitals, ...patch.value } }) : patch
      }
      case "heal": {
        const patch = applyHeal(vitals, write.amount)
        return patch.ok ? ok({ vitals: { ...vitals, ...patch.value } }) : patch
      }
      case "setMax":
        return ok({ vitals: { ...vitals, base: write.amount } })
    }
  },
}

export const skillPoolWriter: EntityWriter<PoolWrite> = {
  component: "skillPool",
  durableClass: "vitals",
  applyOp(components, write) {
    const skillPool = components.skillPool
    if (skillPool === undefined) return err("capability-missing")
    switch (write.op) {
      case "damage": {
        const patch = applySpendSP(skillPool, write.amount)
        return patch.ok
          ? ok({ skillPool: { ...skillPool, ...patch.value } })
          : patch
      }
      case "heal": {
        const patch = applyRecoverSP(skillPool, write.amount)
        return patch.ok
          ? ok({ skillPool: { ...skillPool, ...patch.value } })
          : patch
      }
      case "setMax":
        return ok({ skillPool: { ...skillPool, base: write.amount } })
    }
  },
}

export const resourcesWriter: EntityWriter<
  Extract<EntityWrite, { component: "resources" }>
> = {
  component: "resources",
  durableClass: "vitals",
  applyOp(components) {
    const resources = components.resources
    if (resources === undefined) return err("capability-missing")
    const used = applyUsePrisma(resources, PRISMA_BASE_CHARGES)
    return used.ok ? ok({ resources: { ...resources, ...used.value } }) : used
  },
}

export const mechanicsWriter: EntityWriter<MechanicWrite> = {
  component: "mechanics",
  durableClass: "vitals",
  applyOp(components, write) {
    const mechanics = components.mechanics
    if (mechanics === undefined) return err("capability-missing")
    const definition = getMechanic(write.mechanic)
    const transitions = definition?.transitions
    if (definition === undefined || transitions === undefined)
      return err("no-transitions")
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
}

export type CombatComponents = Components
