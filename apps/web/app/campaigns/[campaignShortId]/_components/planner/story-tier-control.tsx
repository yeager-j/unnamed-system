"use client"

import { CaretDownIcon, StarFourIcon } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { NUMERIC_TIER_LABELS } from "@/domain/labels"

const STORY_TIERS = [1, 2, 3, 4] as const

/**
 * The DM's story-tier control (UNN-581, D8), living beside the clock: the
 * party's shared arc, 1–4 on the four Archetype tiers. DM-advanced only — the
 * one nudge is Day-End's pre-suggest after a deadline resolves; nothing
 * auto-advances. In a gating-enabled campaign this is what opens each
 * character's Origin Lineage on the Atlas.
 */
export function StoryTierControl({
  storyTier,
  onSet,
}: {
  storyTier: number
  onSet: (tier: number) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <StarFourIcon weight="fill" className="size-3.5 text-gold" />
        Story · {NUMERIC_TIER_LABELS[storyTier]}
        <CaretDownIcon className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>The party&apos;s shared arc</DropdownMenuLabel>
          {STORY_TIERS.map((tier) => (
            <DropdownMenuItem
              key={tier}
              disabled={tier === storyTier}
              onClick={() => onSet(tier)}
            >
              {NUMERIC_TIER_LABELS[tier]} ({tier})
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
