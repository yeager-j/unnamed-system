"use client"

import { useState } from "react"

import type { StagedEnemy } from "@/components/combat/enemies/enemy-catalog-panel"

/**
 * An **ephemeral** staged-enemy queue (UNN-467) — the dungeon combat peer of the
 * localStorage-backed {@link import("@/hooks/use-encounter-enemy-queue").useEncounterEnemyQueue}.
 * The dungeon Setup phase and the mid-fight add-combatant dialog stage creatures
 * client-side and never persist a draft (Setup's "Cancel" is a no-op; combat
 * starts already-live), so the queue is plain component state that resets when the
 * dialog closes. Entries hold a catalog key + a count; incrementing an existing key
 * bumps its count, decrementing to zero drops it.
 */
export function useStagedEnemies() {
  const [staged, setStaged] = useState<StagedEnemy[]>([])

  function add(enemyKey: string) {
    setStaged((prev) => {
      const existing = prev.find((entry) => entry.enemyKey === enemyKey)
      return existing
        ? prev.map((entry) =>
            entry.enemyKey === enemyKey
              ? { ...entry, count: entry.count + 1 }
              : entry
          )
        : [...prev, { enemyKey, count: 1 }]
    })
  }

  function setCount(enemyKey: string, count: number) {
    setStaged((prev) =>
      count <= 0
        ? prev.filter((entry) => entry.enemyKey !== enemyKey)
        : prev.map((entry) =>
            entry.enemyKey === enemyKey ? { ...entry, count } : entry
          )
    )
  }

  function decrement(enemyKey: string) {
    setStaged((prev) =>
      prev.flatMap((entry) => {
        if (entry.enemyKey !== enemyKey) return [entry]
        return entry.count <= 1 ? [] : [{ ...entry, count: entry.count - 1 }]
      })
    )
  }

  function remove(enemyKey: string) {
    setStaged((prev) => prev.filter((entry) => entry.enemyKey !== enemyKey))
  }

  function clear() {
    setStaged([])
  }

  const total = staged.reduce((sum, entry) => sum + entry.count, 0)

  return { staged, add, setCount, decrement, remove, clear, total }
}
