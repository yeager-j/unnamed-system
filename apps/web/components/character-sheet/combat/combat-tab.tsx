"use client"

import type { ResolvedSkillCost } from "@workspace/game-v2/skills/skill.schema"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useEntityWrite, useLoadedCharacter } from "@/hooks/use-entity-write"
import type { AffinityStripCell } from "@/lib/character/view/affinity-strip"
import { skillSourceLabels } from "@/lib/character/view/skill-sources"
import { getArchetype } from "@/lib/game-engine-v2"

import { AffinityStrip } from "./affinity-strip"
import { SkillCard } from "./skill-card"

/**
 * The Combat tab (S2a): the affinity strip over the 3-column Skill-card grid
 * — every source (archetype kit, inheritance, equipment) mixed, per the
 * design. **Use Skill** is the out-of-encounter cast: one descriptor spending
 * the resolved cost (`skillPool` for SP, `vitals` for %-of-max HP), with each
 * pool's affordance rule (SP covers, HP must survive) gating the button.
 * Attack previews resolve partyless here (CH8) — party-scaled terms read 0.
 */
export function CombatTab({ cells }: { cells: AffinityStripCell[] }) {
  const role = useViewerRole()
  const { resolved } = useLoadedCharacter()
  const { dispatch, pending } = useEntityWrite()

  const skills = resolved.components.skills ?? []
  const attributes = resolved.components.attributes
  const sources = skillSourceLabels(resolved, getArchetype)

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

  return (
    <div className="flex flex-col gap-4">
      <AffinityStrip cells={cells} />
      {skills.length > 0 && attributes ? (
        <section
          aria-label="Skills"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {skills.map((skill) => (
            <SkillCard
              key={skill.skill.key}
              resolved={skill}
              attributes={attributes}
              sourceLabel={sources.get(skill.skill.key)}
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
        </section>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No Skills yet.
        </p>
      )}
    </div>
  )
}
