import { Badge } from "@workspace/ui/components/badge"

import type { ItemEffect } from "@/lib/game/items"
import { getSkill } from "@/lib/game/skills"
import {
  AFFINITY_DAMAGE_TYPE_LABELS,
  AFFINITY_LABELS,
  BONUS_TARGET_LABELS,
} from "@/lib/ui/labels"

/**
 * Renders an equippable item's effect list as inline badges. Shared by the
 * always-visible Equipped slots and the click-popover on each Inventory row so
 * the Attribute / Affinity / Granted Skill phrasing cannot drift between the
 * two surfaces. When an item carries no effects, renders nothing.
 */
export function ItemEffects({
  effects,
}: {
  effects: readonly ItemEffect[] | undefined
}) {
  if (!effects || effects.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {effects.map((effect) => (
        <li key={effectKey(effect)}>
          <Badge variant="secondary" className="font-normal">
            {effectLabel(effect)}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function effectKey(effect: ItemEffect): string {
  switch (effect.type) {
    case "attribute":
      return `attribute-${effect.target}`
    case "affinity":
      return `affinity-${effect.affinity}-${effect.damageTypes.join(",")}`
    case "skill":
      return `skill-${effect.skillKey}`
  }
}

function effectLabel(effect: ItemEffect): string {
  switch (effect.type) {
    case "attribute":
      return `${formatSigned(effect.amount)} ${BONUS_TARGET_LABELS[effect.target]}`
    case "affinity":
      return `${AFFINITY_LABELS[effect.affinity]} ${effect.damageTypes
        .map((type) => AFFINITY_DAMAGE_TYPE_LABELS[type])
        .join(", ")}`
    case "skill":
      return `Grants ${getSkill(effect.skillKey)?.name ?? effect.skillKey}`
  }
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`
}
