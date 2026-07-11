"use client"

import { resolveInventory } from "@/domain/game-engine-v2"
import { useLoadedCharacter } from "@/hooks/use-entity-write"

import { EquippedCard } from "./equipped-card"
import { InventoryCard } from "./inventory-card"

/**
 * The Inventory tab (S2c — UNN-559): the Equipped slots over the filterable
 * item table + wallet. Reads the **optimistic** frame, so an equip/unequip
 * re-folds derived stats (affinities, granted skills) in the same interaction
 * (CH18).
 */
export function InventoryTab() {
  const { entity } = useLoadedCharacter()
  const equipment = entity.components.equipment

  const inventory = resolveInventory(equipment?.items ?? [])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-4">
      <EquippedCard inventory={inventory} />
      <InventoryCard
        inventory={inventory}
        currency={equipment?.currency ?? 0}
      />
    </div>
  )
}
