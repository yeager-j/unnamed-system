"use client"

import type { HydratedCostSkill } from "@workspace/game/character"
import { canAfford } from "@workspace/game/skills"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"

import { OwnerOnly } from "@/components/shell/viewer-role"

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
  /** Narrowed to the cost-bearing variant of {@link HydratedSkill}: a
   *  cost-less passive can never be Cast, so requiring the narrowed type
   *  pushes that guard to the caller and lets this component trust
   *  `skill.resolvedCost` (UNN-231). */
  skill: HydratedCostSkill
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
 * Skill. The disabled state is wrapped in a Tooltip so the reason —
 * `"Not enough SP"` or `"Would drop HP to 0"` — surfaces on hover/tap.
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
  // Affordability routes through the shared `canAfford` primitive
  // (UNN-231) so the disabled state can never drift from `applyResolvedCost`
  // (server engine) or the optimistic reducer.
  const cost = skill.resolvedCost
  const affordable = canAfford(cost, cast)
  const disabled = !affordable || cast.pending
  const disabledReason = !affordable
    ? cost.kind === "sp"
      ? "Not enough SP"
      : "Would drop HP to 0"
    : undefined

  return (
    <OwnerOnly>
      <div className={className}>
        <TooltipButton
          size={variant === "inline" ? "xs" : "sm"}
          disabled={disabled}
          disabledReason={disabledReason}
          onClick={(event) => {
            event.stopPropagation()
            cast.onCast(skill.key)
          }}
        >
          Cast
        </TooltipButton>
      </div>
    </OwnerOnly>
  )
}
