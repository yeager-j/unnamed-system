import { hasUnlockedRank } from "@workspace/game-v2/archetypes/rank"
import type { ResolvedArchetypeSkill } from "@workspace/game-v2/archetypes/resolved-skill"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import { ItemGroup } from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"

import { DetailSection } from "@/components/shared/detail-section"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import { buildSkillCardView } from "@/lib/combat/view/skill-card-view"

/**
 * Per-rank Skill list over the v2 engine's `ResolvedArchetypeSkill` — the
 * `ArchetypeRankedSkills` peer the builder's Origin picker renders (UNN-556;
 * the S2 Archetypes tab reuses it, and the v1 twin dies with the old sheet).
 *
 * Every rank renders as full {@link ResolvedSkillRow}s with the preview
 * popover. When `currentRank` is provided, ranks above it are labelled "Locked"
 * and dimmed but stay previewable — a Rank you'll unlock is worth inspecting.
 * When `currentRank` is omitted (catalog preview — builder Origin picker),
 * nothing is locked. `attributes` flows through so the popover's formulas
 * hydrate against the caller's choice of scores.
 */
export function ArchetypeResolvedSkills({
  ranks,
  currentRank,
  attributes,
}: {
  ranks: ResolvedArchetypeSkill[]
  currentRank?: number
  attributes: AttributeScores
}) {
  if (ranks.length === 0) return null

  const grouped = new Map<number, ResolvedArchetypeSkill[]>()
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
            <ItemGroup className={cn("gap-0", !unlocked && "opacity-50")}>
              {skills.map((ranked) => (
                <ResolvedSkillRow
                  key={ranked.skill.key}
                  view={buildSkillCardView(ranked, attributes)}
                />
              ))}
            </ItemGroup>
          </div>
        )
      })}
    </DetailSection>
  )
}
