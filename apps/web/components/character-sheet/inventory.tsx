import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import type { HydratedCharacter } from "@/lib/game/hydrated-character"
import {
  resolveInventory,
  type ResolvedInventory,
} from "@/lib/game/items/resolve-inventory"
import type { EquippableItem } from "@/lib/game/items/schema"

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
 *    brief description; clicking reveals full effects in a popover. Empty
 *    roster ⇒ a single "No items yet" placeholder.
 *
 * Display-only; no equip/unequip, add-to-inventory, or add/spend-currency
 * controls (those are owner-mode tickets).
 */
export function Inventory({ character }: { character: HydratedCharacter }) {
  const resolved = resolveInventory(character.inventory)
  return (
    <div className="flex flex-col gap-4">
      <EquippedSection resolved={resolved} />
      <InventoryList resolved={resolved} currency={character.currency} />
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
}: {
  resolved: ResolvedInventory
  currency: number
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
                    {entries.map((entry) => (
                      <InventoryRow
                        key={entry.item.key}
                        item={entry.item}
                        equipped={entry.equipped}
                      />
                    ))}
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
