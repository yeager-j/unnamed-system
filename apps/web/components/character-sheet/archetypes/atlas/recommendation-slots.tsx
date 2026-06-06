import type { AtlasRecommendation } from "@workspace/game/archetypes"
import type { PathChoice } from "@workspace/game/character"

import {
  LINEAGE_DISPLAY,
  PATH_CHOICE_LABELS,
  RECOMMENDATION_REASON_DISPLAY,
  TIER_LABELS,
} from "@/lib/ui/labels"
import { LINEAGE_ICONS } from "@/lib/ui/lineage-icons"
import { RECOMMENDATION_REASON_ICONS } from "@/lib/ui/recommendation-reason-icons"

import { ArchetypeActionButton } from "./archetype-action-button"

/**
 * The three "Recommended for your [Path] Path" slots at the top of the Atlas.
 *
 * UNN-239 renders the slots; UNN-256 fills them via `recommendations`, each
 * carrying the {@link AtlasRecommendation.reason} the card surfaces (Origin
 * Lineage / Unlocked Archetype / Fits Your Path). Fewer than three viable picks
 * means fewer cards — no placeholder pretends to recommend nothing; with none,
 * the row shows a single empty state.
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
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.archetype.key}
              recommendation={recommendation}
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
  savedRanks,
}: {
  recommendation: AtlasRecommendation
  savedRanks: number
}) {
  const { archetype, state, characterArchetypeId, reason } = recommendation
  const reasonDisplay = RECOMMENDATION_REASON_DISPLAY[reason]
  const ReasonIcon = RECOMMENDATION_REASON_ICONS[reasonDisplay.icon]
  const display = LINEAGE_DISPLAY[recommendation.archetype.lineage]
  const Icon = LINEAGE_ICONS[display.icon]

  return (
    <div className="flex flex-1 items-center justify-between gap-3 border bg-card p-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center border border-dashed bg-muted text-muted-foreground"
      >
        <Icon className="size-4" />
      </span>
      <div className="flex flex-1 flex-col">
        <span className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase">
          <ReasonIcon className="size-3 shrink-0" weight="bold" aria-hidden />
          {reasonDisplay.label}
        </span>
        <span className="font-serif font-semibold">{archetype.name}</span>
        <span className="text-xs text-muted-foreground">
          {TIER_LABELS[archetype.tier]} · {display.label}
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
