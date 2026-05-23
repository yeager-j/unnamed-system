import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { OwnerOnly } from "@/components/shell/viewer-role"
import type { EquippableItem } from "@/lib/game/items/schema"

import { ItemEffects } from "./item-effects"

/**
 * One row in the full Inventory list. The row is a popover trigger — click on
 * desktop or tap on mobile opens a popover with the item's full effects.
 * Always-visible content stays scannable (name + brief description) without
 * the full effects crowding the list. Slot type is conveyed by the group
 * heading, so the row carries no slot badge; the only per-row tag is
 * "Equipped" when applicable. Built on the shadcn {@link Item} primitive so
 * the list inherits consistent typography and focus-visible styling.
 *
 * **Owner-mode (UNN-180)**: the popover gains an Equip / Unequip button at
 * the bottom. Non-owners and signed-out viewers never see it.
 */
export function InventoryRow({
  item,
  equipped,
  pending,
  onEquip,
  onUnequip,
}: {
  item: EquippableItem
  equipped: boolean
  pending?: boolean
  onEquip?: () => void
  onUnequip?: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Item
            render={<button type="button" />}
            className="cursor-pointer hover:bg-muted/60"
          />
        }
      >
        <ItemContent>
          <ItemTitle>{item.name}</ItemTitle>
          <ItemDescription>{item.description}</ItemDescription>
        </ItemContent>
        {equipped ? (
          <ItemActions>
            <Badge variant="secondary">Equipped</Badge>
          </ItemActions>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80"
        initialFocus={false}
      >
        <InventoryItemCard
          item={item}
          equipped={equipped}
          pending={pending}
          onEquip={onEquip}
          onUnequip={onUnequip}
        />
      </PopoverContent>
    </Popover>
  )
}

function InventoryItemCard({
  item,
  equipped,
  pending,
  onEquip,
  onUnequip,
}: {
  item: EquippableItem
  equipped: boolean
  pending?: boolean
  onEquip?: () => void
  onUnequip?: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base leading-tight font-semibold">{item.name}</h3>
        <Badge variant="outline" className="shrink-0">
          {SLOT_LABELS[item.slot]}
        </Badge>
      </div>
      <p className="text-sm leading-relaxed">{item.description}</p>
      {item.effects && item.effects.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold tracking-wide uppercase">
            Effects
          </h4>
          <ItemEffects effects={item.effects} />
        </div>
      ) : null}
      <OwnerOnly>
        <div className="flex justify-end border-t border-border pt-3">
          {equipped ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !onUnequip}
              onClick={onUnequip}
            >
              Unequip
            </Button>
          ) : (
            <Button size="sm" disabled={pending || !onEquip} onClick={onEquip}>
              Equip
            </Button>
          )}
        </div>
      </OwnerOnly>
    </div>
  )
}

const SLOT_LABELS: Record<EquippableItem["slot"], string> = {
  weapon: "Weapon",
  armor: "Armor",
  accessory: "Accessory",
}
