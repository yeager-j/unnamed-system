import { describe, expect, it } from "vitest"

import {
  addEntry,
  removeEntry,
  setEntryCount,
  totalEnemyCount,
  type StagedEnemyEntry,
} from "./staged-enemy-queue"

const byKey = (entry: StagedEnemyEntry) => entry.enemyKey

describe("staged enemy queue transitions", () => {
  it("folds a repeat add into the matching group", () => {
    const queued = addEntry(
      [{ enemyKey: "goblin", count: 2 }],
      { enemyKey: "goblin", count: 1 },
      byKey
    )

    expect(queued).toEqual([{ enemyKey: "goblin", count: 3 }])
  })

  it("appends a creature the queue doesn't hold yet", () => {
    const queued = addEntry(
      [{ enemyKey: "goblin", count: 2 }],
      { enemyKey: "wraith", count: 1 },
      byKey
    )

    expect(queued).toEqual([
      { enemyKey: "goblin", count: 2 },
      { enemyKey: "wraith", count: 1 },
    ])
  })

  it("drops a group set to zero", () => {
    const queued = setEntryCount(
      [
        { enemyKey: "goblin", count: 1 },
        { enemyKey: "wraith", count: 1 },
      ],
      "goblin",
      0,
      byKey
    )

    expect(queued).toEqual([{ enemyKey: "wraith", count: 1 }])
  })

  it("removes a group by id and sums the rest", () => {
    const queued = removeEntry(
      [
        { enemyKey: "goblin", count: 2 },
        { enemyKey: "wraith", count: 3 },
      ],
      "goblin",
      byKey
    )

    expect(queued).toEqual([{ enemyKey: "wraith", count: 3 }])
    expect(totalEnemyCount(queued)).toBe(3)
  })
})
