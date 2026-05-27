import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"

import { DetailSection } from "@/components/shared/detail-section"
import { SkillRow } from "@/components/shared/skill-row"
import { hasUnlockedRank, type RankedSkill } from "@/lib/game/archetypes"
import type { AttributeScores } from "@/lib/game/character"

/**
 * Per-rank Skill list shared by every Archetype detail surface.
 *
 * When `currentRank` is provided, ranks at-or-below it render unlocked
 * (`SkillRow` with the full popover); ranks above render as muted name-only
 * Badges. When `currentRank` is omitted (catalog preview — builder Origin
 * picker), every rank renders unlocked. `attributes` flows through to
 * `SkillRow` so the popover's formulas can hydrate against the caller's
 * choice of scores — the live sheet passes the active character's resolved
 * attributes, the builder passes the previewed Archetype's intrinsic ones.
 */
export function ArchetypeRankedSkills({
  ranks,
  currentRank,
  attributes,
}: {
  ranks: RankedSkill[]
  currentRank?: number
  attributes: AttributeScores
}) {
  if (ranks.length === 0) return null

  const grouped = new Map<number, RankedSkill[]>()
  for (const ranked of ranks) {
    const bucket = grouped.get(ranked.rank) ?? []
    bucket.push(ranked)
    grouped.set(ranked.rank, bucket)
  }
  const sortedRanks = [...grouped.keys()].sort((a, b) => a - b)

  return (
    <DetailSection title="Skills" className="gap-3">
      {sortedRanks.map((rankNumber) => {
        const unlocked =
          currentRank === undefined
            ? true
            : hasUnlockedRank(currentRank, rankNumber)
        const skills = grouped.get(rankNumber) ?? []
        return (
          <div key={rankNumber} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-xs font-medium">Rank {rankNumber}</h4>
              {unlocked ? null : (
                <span className="text-xs text-muted-foreground italic">
                  Locked
                </span>
              )}
            </div>
            {unlocked ? (
              <ItemGroup className="gap-0">
                {skills.map((ranked) => (
                  <SkillRow
                    key={ranked.key}
                    skill={ranked}
                    attributes={attributes}
                  />
                ))}
              </ItemGroup>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((ranked) => (
                  <Badge
                    key={ranked.key}
                    variant="outline"
                    className="text-muted-foreground"
                  >
                    {ranked.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </DetailSection>
  )
}
