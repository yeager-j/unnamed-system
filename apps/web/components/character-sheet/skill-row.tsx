"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import type { DamageType } from "@/lib/game/affinity"
import type { Weapon } from "@/lib/game/items/schema"
import type { ResolvedSkillCost } from "@/lib/game/skill-cost"
import type { Skill } from "@/lib/game/skills/schema"
import { IntrinsicAttackCard, SkillCard } from "./skill-card"

/**
 * The damage type slot in the row reuses the {@link Skill} schema's
 * `damageType` union, which includes "special" alongside every {@link
 * DamageType}.
 */
type SkillRowDamageType = DamageType | "special"

interface SkillRowProps {
  skill: Skill
  cost: ResolvedSkillCost | null
}

/**
 * One row in the Skills list. Click (or Enter) opens the {@link SkillCard}
 * popover with full Skill detail; clicking outside or pressing Escape
 * dismisses. Hover is deliberately not wired — it would interfere with the
 * Cast button planned for this row in a later ticket. The character's
 * attribute scores come from {@link useCharacter} so the popover can hydrate
 * formulas like `"1d8 + Ma"` to `"1d8 + 4"`. Built on the shadcn {@link Item}
 * primitive shared with the Inventory list.
 */
export function SkillRow({ skill, cost }: SkillRowProps) {
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
        <ItemMedia className="w-20">
          <DamageTypeSlot
            damageType={skill.kind === "attack" ? skill.damageType : null}
          />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{skill.name}</ItemTitle>
          <ItemDescription>{skill.tagline}</ItemDescription>
        </ItemContent>
        <ItemActions className="w-16 justify-center">
          <CostBadge cost={cost} />
        </ItemActions>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80"
        initialFocus={false}
      >
        <SkillCard skill={skill} cost={cost} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The equipped weapon's intrinsic attack as a click-to-open row. Used inside
 * the dedicated Weapon Attack card so the intrinsic attack stays visually
 * separate from granted Skills.
 */
export function IntrinsicAttackRow({ weapon }: { weapon: Weapon }) {
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
        <ItemMedia className="w-20">
          <DamageTypeSlot damageType={weapon.intrinsicAttack.damageType} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{weapon.name}</ItemTitle>
          <ItemDescription>Intrinsic weapon attack.</ItemDescription>
        </ItemContent>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80"
        initialFocus={false}
      >
        <IntrinsicAttackCard weapon={weapon} />
      </PopoverContent>
    </Popover>
  )
}

function CostBadge({ cost }: { cost: ResolvedSkillCost | null }) {
  if (!cost) {
    return (
      <Badge variant="outline" className="w-full text-muted-foreground">
        —
      </Badge>
    )
  }
  return (
    <Badge className="w-full">
      {cost.kind === "sp" ? `${cost.amount} SP` : `${cost.amount} HP`}
    </Badge>
  )
}

/**
 * Fixed-width column for the row's damage-type chip. Attack skills (and the
 * weapon's intrinsic attack) render a tinted {@link DamageTypeBadge};
 * non-attack skills render an em dash so the column stays aligned.
 */
function DamageTypeSlot({
  damageType,
}: {
  damageType: SkillRowDamageType | null
}) {
  return (
    <span className="w-full text-center">
      {damageType ? (
        <DamageTypeBadge damageType={damageType} />
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </span>
  )
}

function DamageTypeBadge({ damageType }: { damageType: SkillRowDamageType }) {
  return (
    <Badge
      className={`w-full border-transparent text-neutral-900 ${DAMAGE_TYPE_BADGE_CLASSES[damageType]}`}
    >
      {DAMAGE_TYPE_LABELS[damageType]}
    </Badge>
  )
}

const DAMAGE_TYPE_LABELS: Record<SkillRowDamageType, string> = {
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
  almighty: "Almighty",
  special: "Special",
}

/**
 * Per-damage-type tint, using a Tailwind 200/300 step so neutral-900 text
 * stays readable on top. Physicals lean warm/earthy; magicals lean toward
 * their element's intuitive color; Almighty and Special are deliberately
 * neutral so they read as "no specific element".
 */
const DAMAGE_TYPE_BADGE_CLASSES: Record<SkillRowDamageType, string> = {
  slash: "bg-mauve-200",
  pierce: "bg-mist-200",
  strike: "bg-olive-300",
  fire: "bg-red-300",
  ice: "bg-blue-200",
  wind: "bg-green-200",
  elec: "bg-yellow-300",
  aether: "bg-cyan-200",
  psy: "bg-purple-200",
  light: "bg-zinc-100",
  dark: "bg-slate-400",
  almighty: "bg-neutral-300",
  special: "bg-neutral-200",
}
