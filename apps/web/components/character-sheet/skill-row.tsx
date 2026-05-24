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
import type { AttributeScores } from "@/lib/game/stats"

import { IntrinsicAttackCard } from "./intrinsic-attack-card"
import { DamageTypeSlot } from "./shared/damage-type-slot"
import { SkillCostBadge } from "./shared/skill-cost-badge"
import { SkillCard } from "./skill-card"

interface SkillRowProps {
  skill: HydratedSkill
  /**
   * Optional attribute scores used to hydrate formulas in the popover card.
   * When provided, the popover skips the {@link useCharacter} context lookup
   * and hydrates against these scores instead — the shape catalog-preview
   * surfaces (e.g. the builder's Origin Archetype picker) use, where there is
   * no `CharacterProvider` in scope. Live-sheet callers omit it and inherit
   * the active character's resolved attributes from context.
   */
  attributes?: AttributeScores
}

/**
 * One row in the Skills list. Click (or Enter) opens the {@link SkillCard}
 * popover with full Skill detail; clicking outside or pressing Escape
 * dismisses. Hover is deliberately not wired — it would interfere with the
 * Cast button planned for this row in a later ticket. Built on the shadcn
 * {@link Item} primitive shared with the Inventory list.
 *
 * Cost badge falls through to the raw catalog cost when `resolvedCost` is
 * null so catalog-only surfaces still show percentage-HP costs.
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
        <SkillCard skill={skill} attributes={attributes} />
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
