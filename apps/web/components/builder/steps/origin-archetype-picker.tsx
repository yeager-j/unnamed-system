"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { setOriginArchetypeAction } from "@/lib/actions/origin-archetype"
import { ARCHETYPES } from "@/lib/game/archetypes"
import { LINEAGES } from "@/lib/game/archetypes/schema"
import type { PathChoice } from "@/lib/game/character"

import { OriginArchetypeCard } from "./origin-archetype-card"

const LINEAGE_ORDER: Record<(typeof LINEAGES)[number], number> =
  Object.fromEntries(
    LINEAGES.map((lineage, index) => [lineage, index])
  ) as Record<(typeof LINEAGES)[number], number>

/**
 * The Origin Archetype picker on Step 2 of the builder (PRD §5.1). Renders
 * every initiate-tier Archetype as a card in the canonical `LINEAGES` order
 * (Warrior → Mage → Knight → Healer at MVP). No Lineage grouping headers —
 * each MVP Lineage has exactly one initiate Archetype, so headers would just
 * repeat each card's own lineage label.
 *
 * Selection writes optimistically through the shared retry pipeline; failure
 * rolls back the optimistic frame and toasts. Switching Origin discards the
 * previous `characterArchetype` row and re-points `activeArchetypeId` in one
 * transaction (see `lib/db/origin-archetype.ts`).
 */
export function OriginArchetypePicker({
  characterId,
  pathChoice,
  originArchetypeKey,
  identityVersion,
}: {
  characterId: string
  pathChoice: PathChoice
  originArchetypeKey: string | null
  identityVersion: number
}) {
  const [pending, startTransition] = useTransition()
  const versionRef = useCharacterTokenRef(identityVersion)
  const [optimisticKey, setOptimisticKey] = useOptimistic(
    originArchetypeKey,
    (_current: string | null, next: string) => next
  )

  const archetypes = ARCHETYPES.filter(
    (archetype) => archetype.tier === "initiate"
  )
    .slice()
    .sort((a, b) => LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage])

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
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Origin Archetype</h2>
        <p className="text-xs text-muted-foreground">
          Your Origin sets your Attributes, Affinities, and starting Skills.
          You&apos;ll begin at Rank 2 in your Origin, unlocking its Rank 1 and
          Rank 2 Skills at character creation.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {archetypes.map((archetype) => (
          <OriginArchetypeCard
            key={archetype.key}
            archetype={archetype}
            pathChoice={pathChoice}
            selected={archetype.key === optimisticKey}
            pending={pending}
            onSelect={() => handleSelect(archetype.key)}
          />
        ))}
      </div>
    </section>
  )
}
