"use client"

import { TrashIcon } from "@phosphor-icons/react"

import { isEquippable, isStackable, type Item } from "@workspace/game/items"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  ItemActions,
  ItemContent,
  ItemDescription,
  Item as ItemRow,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { SLOT_LABELS } from "@/lib/ui/labels"

import { InventoryQuantityStepper } from "./inventory-quantity-stepper"
import { ItemEffects } from "./item-effects"

/**
 * One row in the full Inventory list. The row is a popover trigger — click on
 * desktop or tap on mobile opens a popover with the item's full effects and the
 * owner controls. Always-visible content stays scannable (name + brief
 * description, plus `× N` for a stacked row); slot type is conveyed by the
 * group heading, so the row carries no slot badge — the only per-row tags are
 * the stack count and "Equipped".
 *
 * **Owner-mode (UNN-180 / UNN-223)**: the popover gains an Equip / Unequip
 * button (equippable items), an in-line quantity adjuster (stackable items),
 * and a Remove button (all items). Non-owners and signed-out viewers never see
 * them.
 */
export function InventoryRow({
  item,
  equipped,
  quantity,
  pending,
  onEquip,
  onUnequip,
  onSetQuantity,
  onRemove,
}: {
  item: Item
  equipped: boolean
  quantity: number
  pending?: boolean
  onEquip?: () => void
  onUnequip?: () => void
  onSetQuantity?: (next: number) => void
  onRemove?: () => void
}) {
  const stacked = quantity > 1
  return (
    <Popover>
      <PopoverTrigger
        render={
          <ItemRow
            render={<button type="button" />}
            className="cursor-pointer hover:bg-muted/60"
          />
        }
      >
        <ItemContent>
          <ItemTitle>{item.name}</ItemTitle>
          <ItemDescription>{item.description}</ItemDescription>
        </ItemContent>
        {stacked || equipped ? (
          <ItemActions>
            {stacked ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                × {quantity}
              </span>
            ) : null}
            {equipped ? <Badge variant="secondary">Equipped</Badge> : null}
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
          quantity={quantity}
          pending={pending}
          onEquip={onEquip}
          onUnequip={onUnequip}
          onSetQuantity={onSetQuantity}
          onRemove={onRemove}
        />
      </PopoverContent>
    </Popover>
  )
}

function InventoryItemCard({
  item,
  equipped,
  quantity,
  pending,
  onEquip,
  onUnequip,
  onSetQuantity,
  onRemove,
}: {
  item: Item
  equipped: boolean
  quantity: number
  pending?: boolean
  onEquip?: () => void
  onUnequip?: () => void
  onSetQuantity?: (next: number) => void
  onRemove?: () => void
}) {
  const equippable = isEquippable(item)
  const stackable = isStackable(item)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base leading-tight font-semibold">{item.name}</h3>
        {equippable ? (
          <Badge variant="outline" className="shrink-0">
            {SLOT_LABELS[item.equip.slot]}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed">{item.description}</p>
      {equippable && item.equip.effects && item.equip.effects.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold tracking-wide uppercase">
            Effects
          </h4>
          <ItemEffects effects={item.equip.effects} />
        </div>
      ) : null}
      <OwnerOnly>
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {stackable && onSetQuantity ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Quantity
              </span>
              <InventoryQuantityStepper
                value={quantity}
                max={item.stackSize}
                disabled={pending}
                onChange={onSetQuantity}
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            {onRemove ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={onRemove}
              >
                <TrashIcon weight="bold" aria-hidden />
                Remove
              </Button>
            ) : (
              <span />
            )}
            {equippable ? (
              equipped ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !onUnequip}
                  onClick={onUnequip}
                >
                  Unequip
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={pending || !onEquip}
                  onClick={onEquip}
                >
                  Equip
                </Button>
              )
            ) : null}
          </div>
        </div>
      </OwnerOnly>
    </div>
  )
}
