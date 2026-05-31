import { Badge } from "@workspace/ui/components/badge"

import type { AtlasRecommendation } from "@/lib/game/archetypes"
import type { PathChoice } from "@/lib/game/character"
import { PATH_CHOICE_LABELS, TIER_LABELS } from "@/lib/ui/labels"

import { ArchetypeActionButton } from "./archetype-action-button"

/**
 * The three "Recommended for your [Path] Path" slots at the top of the Atlas.
 *
 * This ticket (UNN-239) *renders* the slots; the logic that fills them ships in
 * UNN-256 and is injected via `recommendations`. Fewer than three viable picks
 * means fewer cards — no placeholder pretends to recommend nothing. With none
 * (today, until UNN-256 lands) the row shows a single empty state.
 */
export function RecommendationSlots({
  recommendations,
  pathChoice,
  savedRanks,
}: {
  recommendations: AtlasRecommendation[]
  pathChoice: PathChoice
  savedRanks: number
}) {
  return (
    <section
      aria-label="Recommendations"
      className="flex flex-col gap-4 sm:flex-row sm:items-center"
    >
      <div className="flex flex-col">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Recommended
        </h2>
        <span className="text-xs text-muted-foreground">
          for your {PATH_CHOICE_LABELS[pathChoice]} Path
        </span>
      </div>
      {recommendations.length === 0 ? (
        <p className="flex-1 border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No recommendations right now — explore the Lineages to plan your next
          Archetype.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((recommendation, index) => (
            <RecommendationCard
              key={recommendation.archetype.key}
              recommendation={recommendation}
              originBadge={index === 0 && recommendation.isOriginLineage}
              savedRanks={savedRanks}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RecommendationCard({
  recommendation,
  originBadge,
  savedRanks,
}: {
  recommendation: AtlasRecommendation
  originBadge: boolean
  savedRanks: number
}) {
  const { archetype, state, characterArchetypeId } = recommendation
  return (
    <div className="flex items-center justify-between gap-3 border bg-card p-3">
      <div className="flex flex-col gap-0.5">
        {originBadge ? (
          <Badge variant="outline" className="mb-1 w-fit">
            Origin Lineage
          </Badge>
        ) : null}
        <span className="font-semibold">{archetype.name}</span>
        <span className="text-xs text-muted-foreground">
          {TIER_LABELS[archetype.tier]}
        </span>
      </div>
      <ArchetypeActionButton
        archetype={archetype}
        state={state}
        characterArchetypeId={characterArchetypeId}
        savedRanks={savedRanks}
        size="sm"
      />
    </div>
  )
}
