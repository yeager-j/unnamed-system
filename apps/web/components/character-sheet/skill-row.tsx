"use client"

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

import type { HydratedSkill } from "@/lib/game/hydrated-character"
import type { Weapon } from "@/lib/game/items/schema"

import { IntrinsicAttackCard } from "./intrinsic-attack-card"
import { DamageTypeSlot } from "./shared/damage-type-slot"
import { SkillCard } from "./skill-card"
import { SkillCostBadge } from "./skill-cost-badge"

interface SkillRowProps {
  skill: HydratedSkill
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
export function SkillRow({ skill }: SkillRowProps) {
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
          <SkillCostBadge cost={skill.resolvedCost} className="w-full" />
        </ItemActions>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80"
        initialFocus={false}
      >
        <SkillCard skill={skill} />
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
