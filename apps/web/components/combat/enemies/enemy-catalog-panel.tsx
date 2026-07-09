"use client"

import { useState, type ReactNode } from "react"

import {
  getEnemy,
  getEnemyFamily,
  type EnemyFamily,
} from "@workspace/game-v2/catalog/enemies"
import {
  buildEnemyCatalogRows,
  enemyFamilyCounts,
  filterEnemyCatalogRows,
  groupEnemyRowsByLevel,
} from "@workspace/game-v2/catalog/enemies/catalog-rows"

import { enemyStatblockView } from "@/lib/combat/view/enemy-statblock-view"
import { resolveEntity } from "@/lib/game-engine-v2"

import { EnemyCatalogList } from "./enemy-catalog-list"
import { EnemyStatblockCard } from "./enemy-statblock-card"

/**
 * The catalog **browse** inner surface (UNN-467) — the three-column master-detail
 * (searchable/family-filtered list · statblock card · staging rail) shared by the
 * mapless encounter's browse route
 * ({@link import("@/components/encounter/enemy-catalog-browser").EnemyCatalogBrowser})
 * and the delve's pre-combat staging
 * ({@link import("@/components/dungeon/combat/encounter-staging").DungeonEncounterStaging}).
 *
 * It owns only the **browse** UI state (search / family / selection). The staged
 * queue is the consumer's — it arrives already rendered as `rail` (UNN-541), so
 * neither the queue's identity (enemy key vs. enemy × zone) nor what "commit"
 * means reaches this layer.
 */
export function EnemyCatalogPanel({
  rail,
  onAdd,
}: {
  rail: ReactNode
  onAdd: (enemyKey: string) => void
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

  const selectedEntity = selectedKey ? getEnemy(selectedKey) : undefined
  const selectedView =
    selectedEntity && selectedKey
      ? enemyStatblockView(
          selectedEntity,
          resolveEntity(selectedEntity),
          getEnemyFamily(selectedKey) ?? null
        )
      : null

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
        {selectedView && selectedKey ? (
          <EnemyStatblockCard
            view={selectedView}
            onAdd={() => onAdd(selectedKey)}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a creature to see its statblock.
          </p>
        )}
      </div>

      <div className="lg:min-h-0 lg:border-l">{rail}</div>
    </div>
  )
}
