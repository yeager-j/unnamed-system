"use client"

import type { ResolvedSkillCost } from "@workspace/game-v2/skills/skill.schema"
import { sortSkillsByKind } from "@workspace/game-v2/skills/sort"

import { SkillBannerCard } from "@/components/shared/skill-banner-card"
import { useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite, useLoadedCharacter } from "@/hooks/use-entity-write"

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

  const skills = sortSkillsByKind(resolved.components.skills ?? [])
  const attributes = resolved.components.attributes

  const currentHP = resolved.components.vitals?.currentHP ?? 0
  const currentSP = resolved.components.skillPool?.currentSP ?? 0

  const canAfford = (cost: ResolvedSkillCost) =>
    cost.kind === "sp" ? cost.amount <= currentSP : cost.amount < currentHP

  const use = (cost: ResolvedSkillCost) =>
    dispatch(
      cost.kind === "sp"
        ? { component: "skillPool", op: "damage", amount: cost.amount }
        : { component: "vitals", op: "damage", amount: cost.amount }
    )

  if (skills.length === 0 || !attributes) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No Skills yet.
      </p>
    )
  }

  return (
    <section aria-label="Skills" className="flex flex-col gap-2">
      <SectionLabel>Skills · {skills.length}</SectionLabel>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
        {skills.map((skill) => (
          <SkillBannerCard
            key={skill.skill.key}
            resolved={skill}
            attributes={attributes}
            showUse={role === "owner"}
            useDisabled={
              pending ||
              (skill.resolvedCost !== null && !canAfford(skill.resolvedCost))
            }
            onUse={
              skill.resolvedCost ? () => use(skill.resolvedCost!) : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}
