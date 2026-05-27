"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  equipInventoryItemAction,
  unequipInventoryItemAction,
} from "@/lib/actions/inventory"
import type {
  HydratedCharacter,
  HydratedInventoryItem,
} from "@/lib/game/character/stats/hydrated-character"
import type { EquippableItem } from "@/lib/game/items/schema"
import {
  equipItem,
  resolveInventory,
  unequipItem,
  type InventoryItemState,
  type ResolvedInventory,
} from "@/lib/game/items/utils"

import { EquippedSlot } from "./equipped-slot"
import { InventoryRow } from "./inventory-row"

/**
 * The Inventory tab (PRD §6.1 / §6.2 / UNN-149). Two sections, stacked:
 *
 * 1. **Equipped** — three slot blocks (Weapon, Armor, Accessory) with the
 *    equipped item's name, description, and effects inline, or an "Empty
 *    slot" placeholder. The equipped Weapon's intrinsic attack is *not*
 *    shown here — it lives on the Combat tab's Weapon Attack card.
 * 2. **Inventory** — every owned item grouped by slot. Currency sits
 *    right-aligned in this card's header (also shown in the persistent sheet
 *    header) so a deep-linked `?tab=inventory` view is self-contained
 *    without a dedicated single-line Wallet card. Each row shows name +
 *    brief description; clicking reveals full effects in a popover.
 *
 * **Owner-mode (UNN-180)**: an Equip / Unequip button lives at the bottom of
 * each row's popover. Clicks flow through the pure {@link equipItem}
 * /{@link unequipItem} engine for the optimistic frame, then the Server
 * Action persists. After the server revalidates, attributes, affinities, and
 * the weapon attack roll re-derive automatically.
 */
type EquipMutation =
  | { kind: "equip"; itemId: string }
  | { kind: "unequip"; itemId: string }

export function Inventory({ character }: { character: HydratedCharacter }) {
  const [pending, startTransition] = useTransition()
  // The per-write-class token (inventoryVersion, UNN-140) lives in a ref so
  // a rapid follow-up click reads the value just written by the prior
  // save's success branch — without waiting for React commit + effect to
  // propagate the new prop. Per-class scoping means an unrelated
  // identity/vitals/progression edit bumps a different column and doesn't
  // race with us.
  const versionRef = useCharacterTokenRef(character.inventoryVersion)

  const [optimisticInventory, applyOptimistic] = useOptimistic(
    character.inventory,
    (current: HydratedInventoryItem[], mutation: EquipMutation) => {
      const projection: InventoryItemState[] = current.map((entry) => ({
        id: entry.id,
        catalogItemKey: entry.catalogItemKey,
        equipped: entry.equipped,
      }))

      const result =
        mutation.kind === "equip"
          ? equipItem(projection, mutation.itemId)
          : unequipItem(projection, mutation.itemId)

      if (!result.ok) return current

      const equippedById = new Map(
        result.value.map((entry) => [entry.id, entry.equipped])
      )
      return current.map((entry) => ({
        ...entry,
        equipped: equippedById.get(entry.id) ?? entry.equipped,
      }))
    }
  )

  const resolved = resolveInventory(optimisticInventory)

  function handleMutation(mutation: EquipMutation) {
    startTransition(async () => {
      applyOptimistic(mutation)
      const action =
        mutation.kind === "equip"
          ? equipInventoryItemAction
          : unequipInventoryItemAction
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "inventory",
        versionRef,
        action: (expectedVersion) =>
          action({
            characterId: character.id,
            itemId: mutation.itemId,
            expectedVersion,
          }),
      })

      if (result.ok) return

      if (result.error === "stale") {
        toast.error("Couldn't sync inventory — refresh to see the latest.")
      } else {
        toast.error("Couldn't update equipment. Try again.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <EquippedSection resolved={resolved} />
      <InventoryList
        resolved={resolved}
        currency={character.currency}
        pending={pending}
        onEquip={(itemId) => handleMutation({ kind: "equip", itemId })}
        onUnequip={(itemId) => handleMutation({ kind: "unequip", itemId })}
        itemIdByCatalogKey={Object.fromEntries(
          optimisticInventory.map((entry) => [entry.catalogItemKey, entry.id])
        )}
      />
    </div>
  )
}

function EquippedSection({ resolved }: { resolved: ResolvedInventory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipped</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-0">
        <div className="md:pr-6">
          <EquippedSlot label="Weapon" item={resolved.equippedWeapon} />
        </div>
        <div className="md:border-l md:border-border md:px-6">
          <EquippedSlot label="Armor" item={resolved.equippedArmor} />
        </div>
        <div className="md:border-l md:border-border md:pl-6">
          <EquippedSlot label="Accessory" item={resolved.equippedAccessory} />
        </div>
      </CardContent>
    </Card>
  )
}

function InventoryList({
  resolved,
  currency,
  pending,
  onEquip,
  onUnequip,
  itemIdByCatalogKey,
}: {
  resolved: ResolvedInventory
  currency: number
  pending: boolean
  onEquip: (itemId: string) => void
  onUnequip: (itemId: string) => void
  itemIdByCatalogKey: Record<string, string>
}) {
  const totalCount =
    resolved.itemsBySlot.weapon.length +
    resolved.itemsBySlot.armor.length +
    resolved.itemsBySlot.accessory.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <CardAction>
          <span className="text-xs text-muted-foreground tabular-nums">
            {currency} gp
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No items yet — you&rsquo;ll see weapons, armor, and accessories here
            once you add them.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {SLOT_GROUPS.map((group) => {
              const entries = resolved.itemsBySlot[group.slot]
              if (entries.length === 0) return null
              return (
                <section key={group.slot} className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.heading}
                  </h3>
                  <ItemGroup className="gap-0">
                    {entries.map((entry) => {
                      const itemId = itemIdByCatalogKey[entry.item.key]
                      return (
                        <InventoryRow
                          key={entry.item.key}
                          item={entry.item}
                          equipped={entry.equipped}
                          pending={pending}
                          onEquip={itemId ? () => onEquip(itemId) : undefined}
                          onUnequip={
                            itemId ? () => onUnequip(itemId) : undefined
                          }
                        />
                      )
                    })}
                  </ItemGroup>
                </section>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const SLOT_GROUPS: ReadonlyArray<{
  slot: EquippableItem["slot"]
  heading: string
}> = [
  { slot: "weapon", heading: "Weapons" },
  { slot: "armor", heading: "Armor" },
  { slot: "accessory", heading: "Accessories" },
]
