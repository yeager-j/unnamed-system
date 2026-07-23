import { emptyNarrative } from "@workspace/game-v2/narrative"
import {
  addSpark,
  coerceVirtueAllocation,
  exceedsAllocationCap,
  rankUpVirtue,
} from "@workspace/game-v2/virtues"
import { err, ok } from "@workspace/result"

import {
  applySetInheritanceSlot,
  applySetOrigin,
  applySpendArchetypeRank,
} from "@/domain/game-engine-v2"

import type {
  ArchetypesWrite,
  EntityWrite,
  NarrativeWrite,
  PathWrite,
  TalentsWrite,
  VirtuesWrite,
} from "../write.schema"
import type { EntityWriter } from "../writers"

export const pathWriter: EntityWriter<PathWrite> = {
  component: "path",
  durableClass: "identity",
  applyOp: (_components, write) => ok({ path: { choice: write.choice } }),
}

export const creationArchetypesWriter: EntityWriter<ArchetypesWrite> = {
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
        )
          return err("not-unlocked")
        return ok({ archetypes: { ...archetypes, active: write.archetypeKey } })
      }
      case "setInheritanceSlot": {
        const archetypes = components.archetypes
        return archetypes === undefined
          ? err("capability-missing")
          : applySetInheritanceSlot({ archetypes }, write.archetypeKey, {
              slotIndex: write.slotIndex,
              sourceArchetypeKey: write.sourceArchetypeKey,
              skillKey: write.skillKey,
            })
      }
      case "spendArchetypeRank": {
        const archetypes = components.archetypes
        return archetypes === undefined
          ? err("capability-missing")
          : applySpendArchetypeRank({ archetypes }, write.archetypeKey)
      }
    }
  },
}

export const talentsWriter: EntityWriter<TalentsWrite> = {
  component: "talents",
  durableClass: "identity",
  applyOp(components, write) {
    switch (write.op) {
      case "setGained":
        return ok({ talents: write.keys.map((key) => ({ key })) })
      case "add": {
        const talents = components.talents ?? []
        return ok({
          talents: talents.some((talent) => talent.key === write.key)
            ? talents
            : [...talents, { key: write.key }],
        })
      }
      case "remove": {
        const talents = components.talents ?? []
        if (!talents.some((talent) => talent.key === write.key))
          return err("entry-not-found")
        return ok({
          talents: talents.filter((talent) => talent.key !== write.key),
        })
      }
    }
  },
}

export const virtuesWriter: EntityWriter<VirtuesWrite> = {
  component: "virtues",
  durableClass: "progression",
  applyOp(components, write) {
    switch (write.op) {
      case "setAllocation": {
        const ranks = coerceVirtueAllocation(write.ranks)
        if (exceedsAllocationCap(ranks)) return err("allocation-cap-exceeded")
        return ok({
          virtues: { ranks, sparkLog: components.virtues?.sparkLog ?? [] },
        })
      }
      case "addSpark": {
        const virtues = components.virtues
        if (virtues === undefined) return err("capability-missing")
        const next = addSpark(virtues, write.virtue)
        return next.ok ? ok({ virtues: next.value }) : next
      }
      case "rankUp": {
        const virtues = components.virtues
        if (virtues === undefined) return err("capability-missing")
        const next = rankUpVirtue(virtues, write.virtue)
        return next.ok ? ok({ virtues: next.value }) : next
      }
    }
  },
}

export const narrativeWriter: EntityWriter<NarrativeWrite> = {
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
      case "removeListEntry":
        if (write.index >= base[write.list].length)
          return err("entry-not-found")
        return ok({
          narrative: {
            ...base,
            [write.list]: base[write.list].filter(
              (_entry, index) => index !== write.index
            ),
          },
        })
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
}

export type CreationWrite = Extract<
  EntityWrite,
  { component: "path" | "archetypes" | "talents" | "virtues" | "narrative" }
>
