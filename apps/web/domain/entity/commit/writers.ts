import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { Result } from "@workspace/result"

import type { LiftedComponentKey } from "@/domain/game-v2/entity-row-to-bag"
import type { VersionClass } from "@/lib/db/version-classes"

import { exhaustionWriter, levelWriter, restWriter } from "./arms/character"
import {
  mechanicsWriter,
  resourcesWriter,
  skillPoolWriter,
  vitalsWriter,
} from "./arms/combat"
import {
  creationArchetypesWriter,
  narrativeWriter,
  pathWriter,
  talentsWriter,
  virtuesWriter,
} from "./arms/creation"
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

export type EntityWritePatch = Partial<
  Omit<ComponentRegistry, LiftedComponentKey>
>
type Components = Partial<ComponentRegistry>

export interface EntityWriter<W extends EntityWrite = EntityWrite> {
  component: W["component"]
  durableClass: VersionClass
  applyOp(
    components: Components,
    write: W
  ): Result<EntityWritePatch, EntityWriteRefusal>
}

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

export const ENTITY_WRITERS: WriterMap = {
  vitals: vitalsWriter,
  skillPool: skillPoolWriter,
  resources: resourcesWriter,
  mechanics: mechanicsWriter,
  rest: restWriter,
  exhaustion: exhaustionWriter,
  level: levelWriter,
  path: pathWriter,
  archetypes: creationArchetypesWriter,
  talents: talentsWriter,
  virtues: virtuesWriter,
  narrative: narrativeWriter,
  equipment: equipmentWriter,
}

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
