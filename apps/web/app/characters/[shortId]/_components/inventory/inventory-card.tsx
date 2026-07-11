"use client"

import type { ResolvedInventory } from "@workspace/game-v2/items"

import { SheetCard } from "@/components/shared/sheet-cards/sheet-card"
import { OwnerOnly } from "@/components/shell/viewer-role"
import { buildInventoryRows } from "@/domain/character/view/inventory-table"

import { AddItemDialog } from "./add-item-dialog"
import { InventoryTable } from "./inventory-table"
import { Wallet } from "./wallet"

/**
 * The Inventory card (S2c — UNN-559): wallet + owner's Add item in the header,
 * the filterable Data Table as the body (UNN-163's search/filter folded in).
 */
export function InventoryCard({
  inventory,
  currency,
}: {
  inventory: ResolvedInventory
  currency: number
}) {
  const rows = buildInventoryRows(inventory)

  return (
    <SheetCard
      title="Inventory"
      headerSlot={
        <div className="flex items-center gap-2">
          <Wallet currency={currency} />
          <OwnerOnly>
            <AddItemDialog />
          </OwnerOnly>
        </div>
      }
    >
      {rows.length > 0 ? (
        <InventoryTable rows={rows} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No items yet.
        </p>
      )}
    </SheetCard>
  )
}
