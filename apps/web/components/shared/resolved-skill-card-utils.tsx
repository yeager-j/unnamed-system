import type { AttackRange } from "@workspace/game-v2/combat/attack.schema"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import { hydrateFormulaText } from "@workspace/game-v2/skills/formula-text"
import type {
  ResolvedSkillCost,
  Skill,
} from "@workspace/game-v2/skills/skill.schema"
import { Badge } from "@workspace/ui/components/badge"

import {
  DAMAGE_TYPE_LABELS,
  DELIVERY_LABELS,
  KNOWN_RANGE_LABELS,
} from "@/lib/ui/labels"

import { SkillCostBadge } from "./skill-cost-badge"
import { type StatRow } from "./stats-grid"

/**
 * Builds the rows for the resolved-Skill popover's stats grid — the v2-native
 * peer of `skill-card-utils.tsx`, reading the composed `Skill` shape (facets
 * by presence: `damage`, `formula`, `duration`). Flat magnitude strings
 * hydrate via the engine's {@link hydrateFormulaText}. Pure; the resolved
 * attributes are passed in.
 */
export function resolvedSkillStatRows(
  skill: Skill,
  cost: ResolvedSkillCost | null,
  attributes: AttributeScores
): StatRow[] {
  const rows: StatRow[] = []

  if (cost) {
    rows.push({ label: "Cost", value: <SkillCostBadge cost={cost} /> })
  }

  if (skill.range) {
    rows.push({
      label: "Range",
      value: <Badge variant="secondary">{rangeLabel(skill.range)}</Badge>,
    })
  }

  if (skill.damage) {
    rows.push({
      label: "Damage",
      value: (
        <>
          {skill.formula ? (
            <Badge variant="secondary">
              {hydrateFormulaText(skill.formula, attributes)}
            </Badge>
          ) : null}
          <Badge variant="secondary">
            {DAMAGE_TYPE_LABELS[skill.damage.damageType]} (
            {DELIVERY_LABELS[skill.damage.delivery]})
          </Badge>
        </>
      ),
    })
    if (skill.damage.hits) {
      rows.push({ label: "Hits", value: <span>{skill.damage.hits}</span> })
    }
  }

  if (skill.kind === "heal" && skill.formula) {
    rows.push({
      label: "Healing",
      value: (
        <Badge variant="secondary">
          {hydrateFormulaText(skill.formula, attributes)}
        </Badge>
      ),
    })
  }

  if (skill.kind === "support" && skill.duration) {
    rows.push({
      label: "Duration",
      value: (
        <span>
          {skill.duration} {skill.duration === 1 ? "turn" : "turns"}
        </span>
      ),
    })
  }

  if (skill.targets) {
    rows.push({ label: "Targets", value: <span>{skill.targets}</span> })
  }

  return rows
}

export function rangeLabel(range: AttackRange): string {
  return range.kind === "known" ? KNOWN_RANGE_LABELS[range.value] : range.value
}
