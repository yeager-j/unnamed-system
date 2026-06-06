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

import type { HydratedSkill } from "@/lib/game/character"
import type { AttributeScores } from "@/lib/game/character/stats/stats"
import type { ResolvedAttackRoll } from "@/lib/game/combat/attack-roll"
import type { EquippedWeapon } from "@/lib/game/items/schema"

import { CastButton, type CastBindings } from "./cast-button"
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
  /**
   * Owner-mode Cast bindings (PRD §7.2). When supplied, the row gains a
   * desktop-only inline Cast echo next to the cost badge, and the popover
   * footer renders a full-size Cast button. Read-only callers (the builder's
   * Archetype preview, the public read-only sheet) omit this prop and no
   * Cast affordance renders.
   */
  cast?: CastBindings
  /**
   * Whether to show the resolved cost — the row's right-hand cost chip and the
   * popover's Cost row. Defaults to `true` (characters pay for Skills). Catalog
   * enemies pay no Skill costs, so the combat drawer passes `false`.
   */
  showCost?: boolean
}

/**
 * One row in the Skills list. Click (or Enter) on the row body opens the
 * {@link SkillCard} popover with full Skill detail; clicking outside or
 * pressing Escape dismisses. The popover trigger wraps the content area only
 * (not the full row) so the actions slot can host its own interactive
 * controls — the inline owner-mode {@link CastButton} (`md+` only) sits
 * there alongside the cost badge. Hover styling on the trigger is
 * intentionally not paired with a hover-popover to avoid stealing the user's
 * intent away from Cast.
 */
export function SkillRow({
  skill,
  attributes,
  cast,
  showCost = true,
}: SkillRowProps) {
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
        {showCost ? (
          <ItemActions className="w-16 justify-center">
            <SkillCostBadge cost={skill.resolvedCost} className="w-full" />
          </ItemActions>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80"
        initialFocus={false}
      >
        <SkillCard
          skill={skill}
          attributes={attributes}
          cast={cast}
          showCost={showCost}
        />
      </PopoverContent>
    </Popover>
  )
}

interface IntrinsicAttackRowProps {
  weapon: EquippedWeapon
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
          <RowBadgeSlot damageType={weapon.equip.intrinsicAttack.damageType} />
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
