"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { OwnerOnly } from "@/components/shell/viewer-role"
import type { HydratedSkill } from "@/lib/game/character"

/**
 * Pool state the Cast button checks affordability against. Sourced from the
 * Skills-tab optimistic state so a chain of casts sees deductions immediately
 * without waiting for the Server Action revalidate.
 */
export interface CastBindings {
  currentHP: number
  currentSP: number
  pending: boolean
  onCast: (skillKey: string) => void
}

interface CastButtonProps {
  skill: HydratedSkill
  cast: CastBindings
  /**
   * Layout hint. `inline` renders compact for the SkillRow's actions slot;
   * `footer` renders the default size for the popover card footer (matches
   * the Equip/Unequip footer on InventoryRow).
   */
  variant: "inline" | "footer"
  /** Optional outer className — used by SkillRow to scope the inline echo to
   *  `md+` breakpoints. */
  className?: string
}

/**
 * The owner-mode Cast affordance shared by the inline SkillRow echo (desktop
 * only) and the SkillCard popover footer (always). PRD §7.2: deduct the
 * resolved cost from the matching pool, refuse to drop the caster to 0 HP via
 * Skill. Cost-less Skills (passives) render nothing. The disabled state is
 * wrapped in a Tooltip so the reason — `"Not enough SP"` or `"Would drop HP
 * to 0"` — surfaces on hover/tap.
 *
 * Wrapped in {@link OwnerOnly} so the public sheet and non-owner viewers
 * never see the button. Read-only callers (the builder's Archetype preview,
 * unauthenticated `/c/{shortId}` views) simply omit the `cast` prop one
 * level up and this component never renders.
 */
export function CastButton({
  skill,
  cast,
  variant,
  className,
}: CastButtonProps) {
  const cost = skill.resolvedCost
  if (!cost) return null

  // The hydrated skill's resolvedCost is already the concrete number — SP
  // costs are flat, HP-percent costs were resolved against max HP at
  // hydration time (PRD §7.2). Affordability mirrors the engine's `canCast`:
  // SP needs >= amount, HP needs > amount (strictly, so a Skill cannot drop
  // the caster to 0 HP).
  const affordable =
    cost.kind === "sp"
      ? cast.currentSP >= cost.amount
      : cast.currentHP > cost.amount
  const disabled = !affordable || cast.pending
  const reason = !affordable
    ? cost.kind === "sp"
      ? "Not enough SP"
      : "Would drop HP to 0"
    : null

  const size = variant === "inline" ? "xs" : "sm"
  const button = (
    <Button
      size={size}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        cast.onCast(skill.key)
      }}
    >
      Cast
    </Button>
  )

  return (
    <OwnerOnly>
      <div className={className}>
        {reason ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span tabIndex={0} className="inline-flex">
                  {button}
                </span>
              }
            />
            <TooltipContent side="top">{reason}</TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </div>
    </OwnerOnly>
  )
}
