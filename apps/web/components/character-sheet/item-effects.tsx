import { Badge } from "@workspace/ui/components/badge"

import type { Affinity, AffinityDamageType } from "@/lib/game/affinity"
import type { BonusTargetKey } from "@/lib/game/effects"
import type { ItemEffect } from "@/lib/game/items/schema"
import { getSkill } from "@/lib/game/skills"

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
      {effects.map((effect, index) => (
        <li key={index}>
          <Badge variant="secondary" className="font-normal">
            {effectLabel(effect)}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function effectLabel(effect: ItemEffect): string {
  switch (effect.type) {
    case "attribute":
      return `${formatSigned(effect.amount)} ${ATTRIBUTE_LABELS[effect.target]}`
    case "affinity":
      return `${AFFINITY_LABELS[effect.affinity]} ${effect.damageTypes
        .map((type) => DAMAGE_TYPE_LABELS[type])
        .join(", ")}`
    case "skill":
      return `Grants ${getSkill(effect.skillKey)?.name ?? effect.skillKey}`
  }
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`
}

const ATTRIBUTE_LABELS: Record<BonusTargetKey, string> = {
  hp: "HP",
  sp: "SP",
  strength: "Strength",
  magic: "Magic",
  agility: "Agility",
  luck: "Luck",
}

const AFFINITY_LABELS: Record<Affinity, string> = {
  weak: "Weak",
  resist: "Resist",
  null: "Null",
  repel: "Repel",
  drain: "Drain",
  neutral: "Neutral",
}

const DAMAGE_TYPE_LABELS: Record<AffinityDamageType, string> = {
  slash: "Slash",
  pierce: "Pierce",
  strike: "Strike",
  fire: "Fire",
  ice: "Ice",
  wind: "Wind",
  elec: "Elec",
  aether: "Aether",
  psy: "Psy",
  light: "Light",
  dark: "Dark",
}
