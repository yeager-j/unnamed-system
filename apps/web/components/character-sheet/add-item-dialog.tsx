"use client"

import { PlusIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { ACCESSORIES, ARMOR, CONSUMABLES, WEAPONS } from "@workspace/game/data"
import { isStackable, type Item } from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

import { ITEM_GROUP_LABELS } from "@/lib/ui/labels"

/**
 * Owner-mode "Add item" affordance (UNN-223). Opens a dialog listing the
 * catalog grouped by capability (Weapons / Armor / Accessories / Consumables).
 * Stackable entries expose an initial-quantity input clamped to the item's
 * stack size; non-stackable entries add one row per click. Adding closes the
 * dialog; the parent owns the optimistic dispatch.
 */
const GROUPS = [
  { key: "weapon", items: WEAPONS },
  { key: "armor", items: ARMOR },
  { key: "accessory", items: ACCESSORIES },
  { key: "consumable", items: CONSUMABLES },
] as const satisfies ReadonlyArray<{
  key: keyof typeof ITEM_GROUP_LABELS
  items: readonly Item[]
}>

export function AddItemDialog({
  disabled,
  onAdd,
}: {
  disabled?: boolean
  onAdd: (catalogItemKey: string, quantity: number) => void
}) {
  const [open, setOpen] = useState(false)

  function handleAdd(catalogItemKey: string, quantity: number) {
    onAdd(catalogItemKey, quantity)
    setOpen(false)
  }

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <PlusIcon weight="bold" aria-hidden />
        Add item
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
            <DialogDescription>
              Choose an item from the catalog to add to your inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            {GROUPS.map((group) =>
              group.items.length === 0 ? null : (
                <section key={group.key} className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {ITEM_GROUP_LABELS[group.key]}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {group.items.map((item) => (
                      <AddItemRow
                        key={item.key}
                        item={item}
                        onAdd={handleAdd}
                      />
                    ))}
                  </ul>
                </section>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddItemRow({
  item,
  onAdd,
}: {
  item: Item
  onAdd: (catalogItemKey: string, quantity: number) => void
}) {
  const stackable = isStackable(item)
  const [quantity, setQuantity] = useState("1")

  function add() {
    const parsed = stackable ? Number.parseInt(quantity, 10) : 1
    if (!Number.isFinite(parsed) || parsed < 1) return
    onAdd(item.key, Math.min(item.stackSize, parsed))
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{item.name}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {item.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {stackable ? (
          <Input
            aria-label={`${item.name} quantity`}
            type="number"
            inputMode="numeric"
            min={1}
            max={item.stackSize}
            className="h-8 w-20 text-center tabular-nums"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        ) : null}
        <Button size="sm" onClick={add}>
          Add
        </Button>
      </div>
    </li>
  )
}
