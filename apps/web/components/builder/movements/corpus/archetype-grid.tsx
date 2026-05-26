"use client"

import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { setOriginArchetypeAction } from "@/lib/actions/origin-archetype"
import { ARCHETYPES } from "@/lib/game/archetypes"
import { sortArchetypesByPath } from "@/lib/game/archetypes/sort"
import type { PathChoice } from "@/lib/game/character"
import { PATH_CHOICE_LABELS } from "@/lib/ui/labels"

import { ArchetypeCard } from "./archetype-card"
import { ArchetypeDetail } from "./archetype-detail"

/**
 * The Movement 1 Origin Archetype grid (UNN-215 / ADR-002 §"The Archetype
 * grid"). Renders every initiate-tier Archetype as a compact card in a 3-col
 * grid (1-col mobile). One card may be expanded at a time — clicking a
 * different card swaps the expansion, clicking the expanded card collapses.
 * Selection is independent: the player chooses an Origin via a viewport-
 * sticky "Choose [Lineage] as Origin" button rendered while a card is
 * expanded, and the selected Archetype keeps its compact-card check
 * regardless of which (if any) card is currently expanded.
 *
 * Sort responds to `pathChoice`: a Health-Focused player sees HP-matched
 * Lineages first (see {@link sortArchetypesByPath}). When Path is unset the
 * announcement line above the grid hides — there's no fit to announce.
 */
export function ArchetypeGrid({
  characterId,
  pathChoice,
  originArchetypeKey,
  identityVersion,
}: {
  characterId: string
  pathChoice: PathChoice | null
  originArchetypeKey: string | null
  identityVersion: number
}) {
  const [pending, startTransition] = useTransition()
  const versionRef = useCharacterTokenRef(identityVersion)
  const [optimisticKey, setOptimisticKey] = useOptimistic(
    originArchetypeKey,
    (_current: string | null, next: string) => next
  )
  const [expandedKey, setExpandedKey] = useState<string | null>(
    originArchetypeKey
  )

  const initiates = ARCHETYPES.filter((a) => a.tier === "initiate")
  const sorted = sortArchetypesByPath(initiates, pathChoice)
  const expanded = sorted.find((a) => a.key === expandedKey) ?? null

  function handleToggleExpand(key: string) {
    setExpandedKey((current) => (current === key ? null : key))
  }

  function handleSelect(archetypeKey: string) {
    if (archetypeKey === optimisticKey) return
    startTransition(async () => {
      setOptimisticKey(archetypeKey)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          setOriginArchetypeAction({
            characterId,
            archetypeKey: archetypeKey as never,
            expectedVersion,
          }),
      })
      if (!result.ok) {
        if (result.error === "stale") {
          toast.error(
            "Someone else updated this character — refresh to see the latest."
          )
        } else if (result.error === "character-not-found") {
          toast.error("This character was deleted.")
        } else {
          toast.error("Couldn't save your Origin. Try again.")
        }
      }
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-lg font-medium text-foreground">
          Origin Archetype
        </h2>
        {pathChoice ? (
          <p className="text-xs text-muted-foreground">
            Sorted by fit with your{" "}
            <span className="text-foreground">
              {PATH_CHOICE_LABELS[pathChoice]}
            </span>{" "}
            path.
          </p>
        ) : null}
      </header>

      <ul className="grid grid-cols-1 gap-4 pb-24 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((archetype) => (
          <li
            key={archetype.key}
            className="contents"
            data-archetype={archetype.key}
          >
            <ArchetypeCard
              archetype={archetype}
              selected={archetype.key === optimisticKey}
              expanded={archetype.key === expandedKey}
              onToggleExpand={() => handleToggleExpand(archetype.key)}
            />
            {expanded?.key === archetype.key ? (
              <div className="col-span-full border border-primary bg-muted/40 p-6">
                <ArchetypeDetail
                  archetype={archetype}
                  pathChoice={pathChoice ?? "balanced"}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {expanded ? (
        <StickyChooseBar
          archetypeName={expanded.name}
          selected={expanded.key === optimisticKey}
          pending={pending}
          onChoose={() => handleSelect(expanded.key)}
        />
      ) : null}
    </section>
  )
}

function StickyChooseBar({
  archetypeName,
  selected,
  pending,
  onChoose,
}: {
  archetypeName: string
  selected: boolean
  pending: boolean
  onChoose: () => void
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-6">
      <Button
        type="button"
        size="lg"
        variant={selected ? "secondary" : "default"}
        disabled={selected || pending}
        onClick={onChoose}
        className="pointer-events-auto shadow-md"
      >
        {selected
          ? `${archetypeName} chosen`
          : `Choose ${archetypeName} as Origin`}
      </Button>
    </div>
  )
}
