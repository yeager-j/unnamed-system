"use client"

import { SkillBannerCard } from "@/components/shared/skill-banner-card"
import { useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite, useLoadedCharacter } from "@/hooks/use-entity-write"
import {
  buildSkillCardViews,
  type SkillCardCost,
} from "@/lib/combat/view/skill-card-view"

import { SectionLabel } from "../section-label"

/**
 * The Skill-card grid and its **cast** affordance — every source (archetype
 * kit, inheritance, equipment) mixed, per the design. **Use Skill** is one
 * descriptor spending the resolved cost (`skillPool` for SP, `vitals` for
 * %-of-max HP), with each pool's affordance rule (SP covers, HP must survive)
 * gating the button.
 *
 * Owns no chrome: the Combat tab wraps it in the content column's padding, the
 * watch's own-sheet column in a narrow rail (UNN-566). The cards reflow to the
 * width they're given.
 */
export function SkillCastSection() {
  const role = useViewerRole()
  const { resolved } = useLoadedCharacter()
  const { dispatch, pending } = useEntityWrite()

  const attributes = resolved.components.attributes

  const currentHP = resolved.components.vitals?.currentHP ?? 0
  const currentSP = resolved.components.skillPool?.currentSP ?? 0

  const canAfford = (cost: SkillCardCost) =>
    cost.kind === "sp" ? cost.amount <= currentSP : cost.amount < currentHP

  const use = (cost: SkillCardCost) =>
    dispatch(
      cost.kind === "sp"
        ? { component: "skillPool", op: "damage", amount: cost.amount }
        : { component: "vitals", op: "damage", amount: cost.amount }
    )

  if ((resolved.components.skills ?? []).length === 0 || !attributes) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No Skills yet.
      </p>
    )
  }

  const views = buildSkillCardViews(
    resolved.components.skills ?? [],
    attributes
  )

  return (
    <section aria-label="Skills" className="flex flex-col gap-2">
      <SectionLabel>Skills · {views.length}</SectionLabel>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {views.map((view) => (
          <SkillBannerCard
            key={view.key}
            view={view}
            showUse={role === "owner"}
            useDisabled={
              pending || (view.cost !== null && !canAfford(view.cost))
            }
            onUse={view.cost ? () => use(view.cost!) : undefined}
          />
        ))}
      </div>
    </section>
  )
}
