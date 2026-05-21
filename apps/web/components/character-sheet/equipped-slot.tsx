import type { EquippableItem } from "@/lib/game/items/schema"

import { ItemEffects } from "./item-effects"

/**
 * One row in the Equipped block on the Inventory tab. Shows the slot label
 * plus the equipped item's name, description, and full effects inline (PRD
 * §6.1 — equipped state lives here, not on the Combat tab). When nothing is
 * equipped, renders an "Empty slot" placeholder. The equipped Weapon's
 * intrinsic attack is intentionally *not* rendered — that lives in the
 * Combat tab's Weapon Attack card.
 */
export function EquippedSlot({
  label,
  item,
}: {
  label: string
  item: EquippableItem | null
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      {item ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>
          <ItemEffects effects={item.effects} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Empty slot</p>
      )}
    </div>
  )
}
