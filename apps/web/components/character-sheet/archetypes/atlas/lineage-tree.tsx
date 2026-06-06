"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"

import type { AtlasLineage } from "@workspace/game/archetypes"
import { Separator } from "@workspace/ui/components/separator"

import { OriginLineageIndicator } from "@/components/shared/origin-lineage-indicator"
import {
  LINEAGE_DISPLAY,
  LINEAGE_LABELS,
  TIER_LABELS,
  TIER_LEVEL_HINT_LABELS,
  TIER_ROMAN_LABELS,
} from "@/lib/ui/labels"
import { LINEAGE_ICONS } from "@/lib/ui/lineage-icons"

import { ArchetypeNodeCard } from "./archetype-node-card"

/**
 * One Lineage's tree: four tier columns (Initiate → Paragon), each with its
 * Roman-numeral header and minimum-level hint, and the tier's Archetype cards
 * stacked beneath. Parent→child prerequisite links are drawn as elbow
 * connection lines on an SVG layer measured from the rendered card positions,
 * so a Lineage that forks at a tier shows its branches. A Lineage with no
 * Archetypes (most are placeholders until their data ships) shows an empty
 * state.
 */
export function LineageTree({
  lineage,
  selectedKey,
  onSelect,
}: {
  lineage: AtlasLineage
  selectedKey: string | null
  onSelect: (archetypeKey: string) => void
}) {
  const allNodes = lineage.columns.flatMap((column) => column.nodes)

  if (allNodes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <LineageHeading lineage={lineage} />
        <p className="text-sm text-muted-foreground italic">
          No Archetypes in this Lineage yet.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <Separator className="sm:hidden" />
      <LineageHeading lineage={lineage} />
      <TreeColumns
        lineage={lineage}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
      <p className="text-xs text-muted-foreground">
        Branches fork into separate Archetypes; each tier needs the previous one
        at Rank 5. Select any node for full Skills, Affinities, and to spend a
        Rank.
      </p>
    </div>
  )
}

function LineageHeading({ lineage }: { lineage: AtlasLineage }) {
  const display = LINEAGE_DISPLAY[lineage.lineage]
  const Icon = LINEAGE_ICONS[display.icon]
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="hidden size-12 shrink-0 place-items-center border border-dashed bg-muted text-muted-foreground sm:grid"
        >
          <Icon className="size-6" />
        </span>
        <div className="flex flex-col">
          {lineage.isOrigin && <OriginLineageIndicator />}
          <h2 className="font-serif text-2xl font-bold">
            {LINEAGE_LABELS[lineage.lineage]}
          </h2>
          {display.description ? (
            <p className="text-sm text-muted-foreground italic">
              {display.description}
            </p>
          ) : null}
        </div>
      </div>
      <span className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
        {lineage.progress.owned}/{lineage.progress.total} unlocked
      </span>
    </div>
  )
}

function TreeColumns({
  lineage,
  selectedKey,
  onSelect,
}: {
  lineage: AtlasLineage
  selectedKey: string | null
  onSelect: (archetypeKey: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef(new Map<string, HTMLElement>())
  const [paths, setPaths] = useState<string[]>([])

  const recompute = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const presentKeys = new Set(
      lineage.columns.flatMap((column) =>
        column.nodes.map((node) => node.archetype.key)
      )
    )
    // Measure against the full-width track (the `min-w-max` element the svg also
    // spans), not the clipped scroll viewport, so connectors past the fold on a
    // narrow screen still draw.
    const origin = track.getBoundingClientRect()
    const next: string[] = []
    for (const column of lineage.columns) {
      for (const node of column.nodes) {
        const childEl = nodeRefs.current.get(node.archetype.key)
        if (!childEl) continue
        for (const parentKey of node.parentKeys) {
          if (!presentKeys.has(parentKey)) continue
          const parentEl = nodeRefs.current.get(parentKey)
          if (!parentEl) continue
          const child = childEl.getBoundingClientRect()
          const parent = parentEl.getBoundingClientRect()
          const x1 = parent.right - origin.left
          const y1 = parent.top + parent.height / 2 - origin.top
          const x2 = child.left - origin.left
          const y2 = child.top + child.height / 2 - origin.top
          const midX = (x1 + x2) / 2
          next.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`)
        }
      }
    }
    setPaths(next)
  }, [lineage])

  useLayoutEffect(() => {
    recompute()
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(recompute)
    observer.observe(container)
    return () => observer.disconnect()
  }, [recompute])

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={`${LINEAGE_LABELS[lineage.lineage]} tree`}
      className="relative overflow-x-auto"
    >
      <div ref={trackRef} className="relative min-w-max">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full text-border"
        >
          {paths.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <div className="relative flex gap-8">
          {lineage.columns.map((column) => (
            <div key={column.tier} className="flex w-56 flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                <span className="font-serif text-sm font-semibold">
                  <span className="font-mono text-muted-foreground">
                    {TIER_ROMAN_LABELS[column.tier]}
                  </span>{" "}
                  {TIER_LABELS[column.tier]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {TIER_LEVEL_HINT_LABELS[column.tier]}
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-center gap-8 py-2">
                {column.nodes.map((node) => (
                  <div
                    key={node.archetype.key}
                    ref={(el) => {
                      if (el) nodeRefs.current.set(node.archetype.key, el)
                      else nodeRefs.current.delete(node.archetype.key)
                    }}
                  >
                    <ArchetypeNodeCard
                      node={node}
                      selected={selectedKey === node.archetype.key}
                      onSelect={() => onSelect(node.archetype.key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
