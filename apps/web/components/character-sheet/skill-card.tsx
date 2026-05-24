"use client"

import { useContext } from "react"

import { CharacterContext } from "@/hooks/use-character"
import type { HydratedSkill } from "@/lib/game/hydrated-character"
import type { AttributeScores } from "@/lib/game/stats"
import { SKILL_KIND_LABELS } from "@/lib/ui/labels"

import { AttackRollTable } from "./shared/attack-roll-table"
import { PopoverCardShell } from "./shared/popover-card-shell"
import { SkillText } from "./shared/skill-text"
import { StatsGrid } from "./shared/stats-grid"
import { skillStatRows } from "./skill-card-utils"

interface SkillCardProps {
  skill: HydratedSkill
  /**
   * Optional attribute scores used to hydrate `+ Ma` / `+ St` formula
   * placeholders in the popover. When omitted, falls back to the
   * {@link CharacterContext} viewer-character's resolved attributes — the
   * live-sheet shape. Catalog-only surfaces (the builder Origin Archetype
   * picker) pass the previewed Archetype's intrinsic Attribute scores
   * directly so formulas hydrate against what those stats *would* be if the
   * player picks this Origin.
   */
  attributes?: AttributeScores
}

/** Attribute fallback used when neither prop nor context supplies scores. */
const ZERO_ATTRIBUTES: AttributeScores = {
  strength: 0,
  magic: 0,
  agility: 0,
  luck: 0,
}

/**
 * The popover body for a Skill row. Renders the Skill's name, kind tag,
 * description, an applicable-fields-only stats grid, the Attack Roll table
 * (for Skills that have one), and any freeform Effect prose. Damage and
 * healing formulas and the Attack Roll header are hydrated with whichever
 * attribute scores the caller provides (prop wins, then character context,
 * then a zero-fallback so the popover never throws in a catalog-only tree
 * that has no `CharacterProvider`).
 */
export function SkillCard({ skill, attributes }: SkillCardProps) {
  const character = useContext(CharacterContext)
  const resolvedAttributes =
    attributes ?? character?.attributes ?? ZERO_ATTRIBUTES

  return (
    <PopoverCardShell
      title={skill.name}
      kindLabel={SKILL_KIND_LABELS[skill.kind]}
    >
      <SkillText>{skill.description}</SkillText>
      <StatsGrid
        rows={skillStatRows(skill, skill.resolvedCost, resolvedAttributes)}
      />
      {"attackRoll" in skill && skill.attackRoll && skill.resolvedAttackRoll ? (
        <AttackRollTable
          roll={skill.attackRoll}
          resolved={skill.resolvedAttackRoll}
          attributes={resolvedAttributes}
        />
      ) : null}
      {skill.effect ? (
        <SkillText className="border-t border-border pt-2">
          {skill.effect}
        </SkillText>
      ) : null}
    </PopoverCardShell>
  )
}
