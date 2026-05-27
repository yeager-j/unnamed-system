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

import type { HydratedSkill } from "@/lib/game/character/stats/hydrated-character"
import type { AttributeScores } from "@/lib/game/character/stats/stats"
import type { ResolvedAttackRoll } from "@/lib/game/combat/attack-roll"
import type { Weapon } from "@/lib/game/items/schema"

import { IntrinsicAttackCard } from "./intrinsic-attack-card"
import { RowBadgeSlot } from "./row-badge-slot"
import { SkillCard } from "./skill-card"
import { SkillCostBadge } from "./skill-cost-badge"

interface SkillRowProps {
  skill: HydratedSkill
  /**
   * Attribute scores used to hydrate the popover's formulas. Required so the
   * leaf component stays prop-driven — every caller (live-sheet Skills tab,
   * the Archetype detail surface, the builder's Origin picker) sources the
   * scores from its own context and passes them in explicitly.
   */
  attributes: AttributeScores
}

/**
 * One row in the Skills list. Click (or Enter) opens the {@link SkillCard}
 * popover with full Skill detail; clicking outside or pressing Escape
 * dismisses. Hover is deliberately not wired — it would interfere with the
 * Cast button planned for this row in a later ticket. Built on the shadcn
 * {@link Item} primitive shared with the Inventory list.
 */
export function SkillRow({ skill, attributes }: SkillRowProps) {
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
          {skill.kind === "attack" ? (
            <RowBadgeSlot damageType={skill.damageType} />
          ) : (
            <RowBadgeSlot kind={skill.kind} />
          )}
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
        <SkillCard skill={skill} attributes={attributes} />
      </PopoverContent>
    </Popover>
  )
}

interface IntrinsicAttackRowProps {
  weapon: Weapon
  /** Same passing-in contract as {@link SkillRowProps.attributes}. */
  attributes: AttributeScores
  /**
   * The character-resolved Attack Roll for this weapon. Pre-resolved at
   * hydration time on the live sheet; passed through here so the popover
   * stays a leaf component with no context reads.
   */
  weaponAttackRoll: ResolvedAttackRoll
}

/**
 * The equipped weapon's intrinsic attack as a click-to-open row. Used inside
 * the dedicated Weapon Attack card so the intrinsic attack stays visually
 * separate from granted Skills.
 */
export function IntrinsicAttackRow({
  weapon,
  attributes,
  weaponAttackRoll,
}: IntrinsicAttackRowProps) {
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
          <RowBadgeSlot damageType={weapon.intrinsicAttack.damageType} />
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
        <IntrinsicAttackCard
          weapon={weapon}
          attributes={attributes}
          weaponAttackRoll={weaponAttackRoll}
        />
      </PopoverContent>
    </Popover>
  )
}
