"use client"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import { OwnerOnly } from "@/components/shell/viewer-role"
import type { HydratedCharacter } from "@/lib/game/character"
import {
  resolveInventory,
  type EquipSlot,
  type InventoryMutation,
  type ResolvedInventory,
} from "@/lib/game/items"
import { ITEM_GROUP_LABELS } from "@/lib/ui/labels"

import { AddItemDialog } from "./add-item-dialog"
import { CurrencyControl } from "./currency-control"
import { EquippedSlot } from "./equipped-slot"
import { InventoryRow } from "./inventory-row"
import { useInventoryEditor } from "./use-inventory-editor"

/**
 * The Inventory tab (PRD §6.1 / §6.2 / §7.7). Two sections, stacked:
 *
 * 1. **Equipped** — three slot blocks (Weapon, Armor, Accessory).
 * 2. **Inventory** — every owned item grouped by capability (Weapons / Armor /
 *    Accessories / Consumables). Stacked rows show `× N`; the wallet sits in the
 *    card header (also in the persistent sheet header) so a deep-linked
 *    `?tab=inventory` view is self-contained.
 *
 * **Owner-mode (UNN-180 / UNN-223)**: add items from the catalog, adjust a
 * stack's quantity, remove rows, and add/spend currency. The write lifecycle
 * (optimistic engine + Server Actions) lives in {@link useInventoryEditor}; this
 * component only shapes the resolved view and renders it.
 */
export function Inventory({ character }: { character: HydratedCharacter }) {
  const {
    character: optimisticCharacter,
    pending,
    dispatchMutation,
    dispatchCurrency,
  } = useInventoryEditor(character)

  const resolved = resolveInventory(optimisticCharacter.inventory)

  return (
    <div className="flex flex-col gap-4">
      <EquippedSection resolved={resolved} />
      <InventoryList
        resolved={resolved}
        currency={optimisticCharacter.currency}
        pending={pending}
        onMutate={dispatchMutation}
        onAddCurrency={(amount) => dispatchCurrency(amount)}
        onSpendCurrency={(amount) => dispatchCurrency(-amount)}
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

const SLOT_GROUPS: ReadonlyArray<{ slot: EquipSlot; heading: string }> = [
  { slot: "weapon", heading: ITEM_GROUP_LABELS.weapon },
  { slot: "armor", heading: ITEM_GROUP_LABELS.armor },
  { slot: "accessory", heading: ITEM_GROUP_LABELS.accessory },
]

function InventoryList({
  resolved,
  currency,
  pending,
  onMutate,
  onAddCurrency,
  onSpendCurrency,
}: {
  resolved: ResolvedInventory
  currency: number
  pending: boolean
  onMutate: (mutation: InventoryMutation) => void
  onAddCurrency: (amount: number) => void
  onSpendCurrency: (amount: number) => void
}) {
  const totalCount =
    resolved.itemsBySlot.weapon.length +
    resolved.itemsBySlot.armor.length +
    resolved.itemsBySlot.accessory.length +
    resolved.consumables.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <CardAction className="flex items-center gap-2">
          <CurrencyControl
            currency={currency}
            disabled={pending}
            onAdd={onAddCurrency}
            onSpend={onSpendCurrency}
          />
          <OwnerOnly>
            <AddItemDialog
              disabled={pending}
              onAdd={(catalogItemKey, quantity) =>
                onMutate({ kind: "add", catalogItemKey, quantity })
              }
            />
          </OwnerOnly>
        </CardAction>
      </CardHeader>
      <CardContent>
        {totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            No items yet — add weapons, armor, accessories, or consumables from
            the catalog.
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
                    {entries.map((entry) => (
                      <InventoryRow
                        key={entry.id}
                        item={entry.item}
                        equipped={entry.equipped}
                        quantity={entry.quantity}
                        pending={pending}
                        onEquip={() =>
                          onMutate({ kind: "equip", itemId: entry.id })
                        }
                        onUnequip={() =>
                          onMutate({ kind: "unequip", itemId: entry.id })
                        }
                        onSetQuantity={(next) =>
                          onMutate({
                            kind: "setQuantity",
                            itemId: entry.id,
                            quantity: next,
                          })
                        }
                        onRemove={() =>
                          onMutate({ kind: "remove", itemId: entry.id })
                        }
                      />
                    ))}
                  </ItemGroup>
                </section>
              )
            })}
            {resolved.consumables.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {ITEM_GROUP_LABELS.consumable}
                </h3>
                <ItemGroup className="gap-0">
                  {resolved.consumables.map((entry) => (
                    <InventoryRow
                      key={entry.id}
                      item={entry.item}
                      equipped={false}
                      quantity={entry.quantity}
                      pending={pending}
                      onSetQuantity={(next) =>
                        onMutate({
                          kind: "setQuantity",
                          itemId: entry.id,
                          quantity: next,
                        })
                      }
                      onRemove={() =>
                        onMutate({ kind: "remove", itemId: entry.id })
                      }
                    />
                  ))}
                </ItemGroup>
              </section>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
