"use client"

import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import { ATTRIBUTE_KEYS } from "@workspace/game-v2/kernel/vocab"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { cn } from "@workspace/ui/lib/utils"

import { listNonNeutralAffinities } from "@/components/archetype/affinities"
import { formatModifier } from "@/components/archetype/format"
import { Sparkle } from "@/components/shared/celestial"
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
  const highlights = listNonNeutralAffinities(archetype)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`View ${LINEAGE_LABELS[archetype.lineage]} details`}
      className={cn(
        "group/archetype-card relative flex h-full w-full flex-col items-stretch gap-3 rounded-xl border bg-card p-5 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected
          ? "border-gold after:pointer-events-none after:absolute after:inset-1 after:rounded-lg after:border after:border-gold/50"
          : "border-border hover:border-gold/40"
      )}
    >
      {selected ? (
        <span
          aria-label="Currently selected as Origin"
          className="pointer-events-none absolute right-3 bottom-3"
        >
          <Sparkle className="size-4 text-gold" />
        </span>
      ) : null}

      <header className="flex items-start justify-between gap-2">
        <h3 className="font-heading text-2xl leading-tight font-semibold tracking-tight text-foreground">
          {archetype.name}
        </h3>
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
