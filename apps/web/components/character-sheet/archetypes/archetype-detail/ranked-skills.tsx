import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"

import type { ArchetypeEntry, RankedSkill } from "@/lib/game/archetypes/entries"
import { hasUnlockedRank } from "@/lib/game/archetypes/schema"

import { DetailSection } from "../../shared/detail-section"
import { SkillRow } from "../../skill-row"

export function ArchetypeRankedSkills({ entry }: { entry: ArchetypeEntry }) {
  const { ranks, row } = entry
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
        const unlocked = hasUnlockedRank(row.rank, rankNumber)
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
                  <SkillRow key={ranked.key} skill={ranked} />
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
