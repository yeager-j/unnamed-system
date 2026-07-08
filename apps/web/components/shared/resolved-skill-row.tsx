"use client"

import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
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

import { RowBadgeSlot } from "./row-badge-slot"
import { SkillBannerCard } from "./skill-banner-card"
import { SkillCostBadge } from "./skill-cost-badge"

interface ResolvedSkillRowProps {
  resolved: ResolvedSkill
  /**
   * Attribute scores used to hydrate the popover's formulas. Required so the
   * leaf component stays prop-driven — every caller sources the scores from
   * its own context and passes them in explicitly.
   */
  attributes: AttributeScores
  /**
   * Whether to show the resolved cost — the row's right-hand cost chip and
   * the popover's Cost row. Defaults to `true` (characters pay for Skills).
   */
  showCost?: boolean
}

/**
 * One row in a v2 resolved-Skills list — the `SkillRow` peer over
 * `ResolvedSkill` (UNN-556; the S2 sheet + the drawer's rich list, UNN-538,
 * reuse it). Click (or Enter) on the row body opens the
 * {@link ResolvedSkillCard} popover with full Skill detail.
 */
export function ResolvedSkillRow({
  resolved,
  attributes,
  showCost = true,
}: ResolvedSkillRowProps) {
  const { skill } = resolved
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
          {skill.damage ? (
            <RowBadgeSlot damageType={skill.damage.damageType} />
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
            <SkillCostBadge cost={resolved.resolvedCost} className="w-full" />
          </ItemActions>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-84 border-none bg-transparent p-0 shadow-xl"
        initialFocus={false}
      >
        <SkillBannerCard
          resolved={resolved}
          attributes={attributes}
          showUse={false}
        />
      </PopoverContent>
    </Popover>
  )
}
