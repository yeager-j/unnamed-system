"use client"

import { CheckIcon } from "@phosphor-icons/react/dist/ssr"

import { getMechanic } from "@workspace/game/engine"
import {
  AFFINITY_DAMAGE_TYPES,
  ATTRIBUTE_KEYS,
  type Affinity,
  type AffinityDamageType,
  type Archetype,
} from "@workspace/game/foundation"
import { cn } from "@workspace/ui/lib/utils"

import { formatModifier } from "@/components/archetype/format"
import {
  AFFINITY_DAMAGE_TYPE_LABELS,
  AFFINITY_LABELS,
  ATTRIBUTE_LABELS,
  LINEAGE_LABELS,
} from "@/lib/ui/labels"

/**
 * The compact face of an Origin Archetype in the Movement 1 grid (UNN-215 /
 * ADR-002 §"The Archetype grid"). Renders the at-a-glance summary:
 *
 * - Lineage name (serif, the loudest thing on the card)
 * - "**Mechanic.** tagline." — the mechanic's identity sentence
 * - Attribute row in mono
 * - Every non-Neutral affinity highlight
 *
 * Clickable to open: tapping the card body invokes `onOpen`, which surfaces the
 * full {@link ArchetypeDialog} detail + "Choose as Origin" CTA. `selected`
 * flips a quiet selection indicator (a check on the corner) — the chosen Origin
 * keeps its check regardless of which card the player opens next.
 */
export function ArchetypeCard({
  archetype,
  selected,
  onOpen,
}: {
  archetype: Archetype
  selected: boolean
  onOpen: () => void
}) {
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  const highlights = listAffinityHighlights(archetype)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`View ${LINEAGE_LABELS[archetype.lineage]} details`}
      className={cn(
        "group/archetype-card flex h-full w-full flex-col items-stretch gap-3 border bg-background p-5 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected
          ? "border-primary/60 hover:border-primary"
          : "border-border hover:border-foreground/40"
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="font-heading text-2xl leading-tight font-medium text-foreground">
          {archetype.name}
        </h3>
        {selected ? (
          <span
            aria-label="Currently selected as Origin"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <CheckIcon weight="bold" className="size-3" />
          </span>
        ) : null}
      </header>

      {mechanic ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {mechanic.displayName}.
          </span>{" "}
          {mechanic.tagline}
        </p>
      ) : null}

      <dl className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums">
        {ATTRIBUTE_KEYS.map((key) => (
          <div key={key} className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</dt>
            <dd className="text-foreground">
              {formatModifier(archetype.attributes[key])}
            </dd>
          </div>
        ))}
      </dl>

      {highlights.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {highlights.map(({ type, affinity }, index) => (
            <span key={type}>
              {index > 0 ? " · " : null}
              {AFFINITY_DAMAGE_TYPE_LABELS[type]}{" "}
              <span className="text-foreground">
                {AFFINITY_LABELS[affinity]}
              </span>
            </span>
          ))}
        </p>
      ) : null}
    </button>
  )
}

/**
 * Every non-Neutral affinity entry on an Archetype's chart, in canonical
 * `AFFINITY_DAMAGE_TYPES` order. The compact card surfaces all of them so
 * a Healer's Strike weak / Light resist / Dark weak read at a glance without
 * the player having to expand the card. Stable order across renders.
 */
function listAffinityHighlights(
  archetype: Archetype
): { type: AffinityDamageType; affinity: Affinity }[] {
  return AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })
}
