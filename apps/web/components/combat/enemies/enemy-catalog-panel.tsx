"use client"

import { useState } from "react"

import { getEnemy, getEnemyFamily } from "@workspace/game/data"
import {
  enemyFamilyCounts,
  filterEnemyCatalogRows,
  groupEnemyRowsByLevel,
} from "@workspace/game/engine"
import { type EnemyFamily } from "@workspace/game/foundation"

import { buildEnemyCatalogRows, statblockFromEnemy } from "@/lib/game-engine"

import { EnemyCatalogList } from "./enemy-catalog-list"
import { EnemyQueueRail } from "./enemy-queue-rail"
import { EnemyStatblockCard } from "./enemy-statblock-card"

/** One staged creature: a catalog key and how many of it are queued. */
export interface StagedEnemy {
  enemyKey: string
  count: number
}

/**
 * The catalog **browse-and-stage** inner surface (UNN-467) — the three-column
 * master-detail (searchable/family-filtered list · statblock card · staging rail)
 * extracted from {@link import("./enemy-catalog-browser").EnemyCatalogBrowser} so
 * three consumers share it: the standalone setup route (its own header + commit
 * routing wrap this), the dungeon encounter Setup phase, and the mid-fight
 * add-combatant dialog. It owns only the **browse** UI state (search / family /
 * selection); the staged `queue` and the commit/cancel verbs are the parent's, so
 * each consumer decides how the queue is held (localStorage vs ephemeral state)
 * and what "commit" does.
 */
export function EnemyCatalogPanel({
  queue,
  isPending,
  onAdd,
  onIncrement,
  onDecrement,
  onRemove,
  onCommit,
  onCancel,
}: {
  queue: StagedEnemy[]
  isPending: boolean
  onAdd: (enemyKey: string) => void
  onIncrement: (enemyKey: string) => void
  onDecrement: (enemyKey: string) => void
  onRemove: (enemyKey: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const [search, setSearch] = useState("")
  const [family, setFamily] = useState<EnemyFamily | null>(null)

  const rows = buildEnemyCatalogRows()
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => rows[0]?.key ?? null
  )

  const filtered = filterEnemyCatalogRows(rows, { search, family })
  const groups = groupEnemyRowsByLevel(filtered)
  const familyCounts = enemyFamilyCounts(rows)

  const selectedDefinition = selectedKey ? getEnemy(selectedKey) : undefined
  const selectedStatblock = selectedDefinition
    ? statblockFromEnemy(selectedDefinition)
    : null

  const queueItems = queue.map((entry) => ({
    enemyKey: entry.enemyKey,
    name: getEnemy(entry.enemyKey)?.name ?? entry.enemyKey,
    count: entry.count,
  }))
  const totalCount = queue.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <div className="grid min-h-0 grid-cols-1 lg:flex-1 lg:grid-cols-[18rem_1fr_20rem]">
      <div className="overflow-hidden border-b p-4 lg:min-h-0 lg:border-r lg:border-b-0">
        <EnemyCatalogList
          groups={groups}
          familyCounts={familyCounts}
          totalCount={rows.length}
          filteredCount={filtered.length}
          search={search}
          onSearchChange={setSearch}
          family={family}
          onFamilyChange={setFamily}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onAdd={onAdd}
        />
      </div>

      <div className="border-b p-6 lg:min-h-0 lg:overflow-y-auto lg:border-b-0">
        {selectedStatblock && selectedKey ? (
          <EnemyStatblockCard
            statblock={selectedStatblock}
            family={getEnemyFamily(selectedKey) ?? null}
            onAdd={() => onAdd(selectedKey)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a creature to see its statblock.
          </p>
        )}
      </div>

      <div className="lg:min-h-0 lg:border-l">
        <EnemyQueueRail
          items={queueItems}
          totalCount={totalCount}
          isPending={isPending}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          onRemove={onRemove}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      </div>
    </div>
  )
}
