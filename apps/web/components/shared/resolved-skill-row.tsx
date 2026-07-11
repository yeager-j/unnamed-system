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

import type { SkillCardView } from "@/lib/combat/view/skill-card-view"

import { RowBadgeSlot } from "./row-badge-slot"
import { SkillBannerCard } from "./skill-banner-card"
import { SkillCostBadge } from "./skill-cost-badge"

interface ResolvedSkillRowProps {
  view: SkillCardView
  /**
   * Whether to show the resolved cost — the row's right-hand cost chip and
   * the popover's Cost row. Defaults to `true` (characters pay for Skills).
   */
  showCost?: boolean
}

/**
 * One row in a v2 resolved-Skills list — the `SkillRow` peer over a
 * {@link SkillCardView} (UNN-556; the S2 sheet + the drawer's rich list,
 * UNN-538, reuse it). Click (or Enter) on the row body opens the Banner Skill
 * card popover with full Skill detail. Every caller builds the view from a
 * resolved Skill via `buildSkillCardView`, so this leaf stays engine-blind.
 */
export function ResolvedSkillRow({
  view,
  showCost = true,
}: ResolvedSkillRowProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Item
            render={<button type="button" aria-label={view.name} />}
            className="cursor-pointer hover:bg-muted/60"
          />
        }
      >
        <ItemMedia className="w-20">
          <RowBadgeSlot {...view.badge} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{view.name}</ItemTitle>
          <ItemDescription>{view.tagline}</ItemDescription>
        </ItemContent>
        {showCost ? (
          <ItemActions className="w-16 justify-center">
            <SkillCostBadge cost={view.cost} className="w-full" />
          </ItemActions>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-84 border-none bg-transparent p-0 shadow-xl"
        initialFocus={false}
      >
        <SkillBannerCard view={view} showUse={false} showCost={showCost} />
      </PopoverContent>
    </Popover>
  )
}
