import { describe, expect, it } from "vitest"

import { addEntry } from "@/domain/combat/staged-enemy-queue"
import { MAX_STAGED_ENEMY_COUNT } from "@/lib/actions/dungeon/start-encounter.schema"

import {
  capEntryCounts,
  moveEntryZone,
  type DungeonStagedEnemy,
} from "./use-dungeon-enemy-queue"

const byKeyAndZone = (entry: DungeonStagedEnemy) =>
  `${entry.enemyKey}::${entry.zoneId}`

describe("the delve queue's enemy × zone identity", () => {
  it("keeps one creature in two zones as two groups", () => {
    const queued = addEntry(
      [{ enemyKey: "goblin", zoneId: "entry", count: 2 }],
      { enemyKey: "goblin", zoneId: "hall", count: 1 },
      byKeyAndZone
    )

    expect(queued).toEqual([
      { enemyKey: "goblin", zoneId: "entry", count: 2 },
      { enemyKey: "goblin", zoneId: "hall", count: 1 },
    ])
  })

  it("merges counts when a group moves onto a zone holding the same creature", () => {
    const queued = moveEntryZone(
      [
        { enemyKey: "goblin", zoneId: "entry", count: 2 },
        { enemyKey: "goblin", zoneId: "hall", count: 1 },
      ],
      "goblin::entry",
      "hall"
    )

    expect(queued).toEqual([{ enemyKey: "goblin", zoneId: "hall", count: 3 }])
  })

  it("re-homes a group onto an empty zone", () => {
    const queued = moveEntryZone(
      [{ enemyKey: "goblin", zoneId: "entry", count: 2 }],
      "goblin::entry",
      "hall"
    )

    expect(queued).toEqual([{ enemyKey: "goblin", zoneId: "hall", count: 2 }])
  })

  it("leaves the queue alone when the moved group is gone", () => {
    const entries: DungeonStagedEnemy[] = [
      { enemyKey: "goblin", zoneId: "entry", count: 2 },
    ]

    expect(moveEntryZone(entries, "wraith::hall", "hall")).toBe(entries)
  })
})

describe("the delve queue's per-group ceiling", () => {
  it("holds a group at the count the start-encounter wire accepts", () => {
    const queued = capEntryCounts([
      { enemyKey: "goblin", zoneId: "entry", count: 21 },
    ])

    expect(queued).toEqual([
      { enemyKey: "goblin", zoneId: "entry", count: MAX_STAGED_ENEMY_COUNT },
    ])
  })

  it("caps a merge that would push two groups past the ceiling", () => {
    const merged = moveEntryZone(
      [
        { enemyKey: "goblin", zoneId: "entry", count: 15 },
        { enemyKey: "goblin", zoneId: "hall", count: 12 },
      ],
      "goblin::entry",
      "hall"
    )

    expect(merged).toEqual([{ enemyKey: "goblin", zoneId: "hall", count: 27 }])
    expect(capEntryCounts(merged)).toEqual([
      { enemyKey: "goblin", zoneId: "hall", count: MAX_STAGED_ENEMY_COUNT },
    ])
  })

  it("leaves a queue already within the ceiling untouched", () => {
    const queued: DungeonStagedEnemy[] = [
      { enemyKey: "goblin", zoneId: "entry", count: MAX_STAGED_ENEMY_COUNT },
    ]

    expect(capEntryCounts(queued)).toEqual(queued)
  })
})
