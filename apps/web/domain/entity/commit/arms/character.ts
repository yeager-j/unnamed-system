import {
  applyAwardVictory,
  applyLevelUp,
  applyRemoveVictory,
} from "@workspace/game-v2/progression/leveling"
import {
  applyFullRest,
  applyPartialRest,
  applyRespite,
  type RestComponents,
} from "@workspace/game-v2/resources/rest"
import { err, ok } from "@workspace/result"

import type {
  EntityWrite,
  ExhaustionWrite,
  LevelWrite,
  RestWrite,
} from "../write.schema"
import type { EntityWriter } from "../writers"

export const restWriter: EntityWriter<RestWrite> = {
  component: "rest",
  durableClass: "vitals",
  applyOp(components, write) {
    const { vitals, skillPool, resources, exhaustion, level } = components
    if (!vitals || !skillPool || !resources || !exhaustion || !level)
      return err("capability-missing")
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
}

export const exhaustionWriter: EntityWriter<ExhaustionWrite> = {
  component: "exhaustion",
  durableClass: "vitals",
  applyOp(components, write) {
    const exhaustion = components.exhaustion
    return exhaustion === undefined
      ? err("capability-missing")
      : ok({ exhaustion: { ...exhaustion, level: write.level } })
  },
}

export const levelWriter: EntityWriter<LevelWrite> = {
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
        return archetypes === undefined
          ? err("capability-missing")
          : applyLevelUp({ level, archetypes })
      }
    }
  },
}

export type CharacterWrite = Extract<
  EntityWrite,
  { component: "rest" | "exhaustion" | "level" }
>
