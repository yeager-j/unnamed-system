"use client"

import {
  EQUIP_SLOTS,
  type EquipSlot,
  type ResolvedInventory,
} from "@workspace/game-v2/items"

import { SLOT_LABELS } from "@/lib/ui/labels"

import { SheetCard } from "../sheet-card"

/**
 * The Equipped zone (v1 design carried into S2c): one column per equip slot —
 * eyebrow slot label, item name, muted description, italic "Empty slot" when
 * nothing is worn. Display-only; equip/unequip lives on the table rows below.
 */
export function EquippedCard({ inventory }: { inventory: ResolvedInventory }) {
  return (
    <SheetCard title="Equipped">
      <div className="grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
        {EQUIP_SLOTS.map((slot) => (
          <EquippedSlot key={slot} slot={slot} inventory={inventory} />
        ))}
      </div>
    </SheetCard>
  )
}

function EquippedSlot({
  slot,
  inventory,
}: {
  slot: EquipSlot
  inventory: ResolvedInventory
}) {
  const item = {
    weapon: inventory.equippedWeapon,
    armor: inventory.equippedArmor,
    accessory: inventory.equippedAccessory,
  }[slot]

  return (
    <div className="flex flex-col gap-1 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        {SLOT_LABELS[slot]}
      </p>
      {item ? (
        <>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{item.description}</p>
        </>
      ) : (
        <p className="text-muted-foreground italic">Empty slot</p>
      )}
    </div>
  )
}
