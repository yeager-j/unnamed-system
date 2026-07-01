"use client"

import { motion, MotionConfig } from "motion/react"
import { useOptimistic, useState } from "react"
import { toast } from "sonner"

import { INITIATE_ARCHETYPES, type ArchetypeKey } from "@workspace/game/data"
import { sortArchetypesByPath } from "@workspace/game/engine"
import { Sparkle } from "@workspace/ui/components/celestial"

import { useBuilderDraft, useBuilderWrite } from "@/hooks/use-builder-draft"
import { setOriginArchetypeAction } from "@/lib/actions/origin-archetype"
import { PATH_CHOICE_LABELS } from "@/lib/ui/labels"

import { ArchetypeCard } from "./archetype-card"
import { ArchetypeDialog } from "./archetype-dialog"

/**
 * The Movement 1 Origin Archetype grid (UNN-215 / ADR-002 §"The Archetype
 * grid"). Renders every initiate-tier Archetype as a compact card in a 3-col
 * grid (1-col mobile). Tapping a card opens an {@link ArchetypeDialog} with the
 * full detail and a "Choose [Lineage] as Origin" CTA; choosing commits the
 * Origin and closes the dialog. The selected Archetype keeps its compact-card
 * check regardless of which (if any) card is currently open.
 *
 * Sort responds to `pathChoice`: a Health-Focused player sees HP-matched
 * Lineages first (see {@link sortArchetypesByPath}). A draft's row always
 * carries a Path (defaulted to `"balanced"` by `startCharacterDraft`), so
 * this never sees a null.
 */
export function ArchetypeGrid() {
  const { id: characterId, pathChoice, originArchetypeKey } = useBuilderDraft()
  const { pending, write } = useBuilderWrite()
  const [optimisticKey, setOptimisticKey] = useOptimistic(
    originArchetypeKey,
    (_current: string | null, next: ArchetypeKey) => next
  )
  const [openKey, setOpenKey] = useState<string | null>(null)

  const sorted = sortArchetypesByPath(INITIATE_ARCHETYPES, pathChoice)
  const open = sorted.find((a) => a.key === openKey) ?? null

  function handleChoose(archetypeKey: ArchetypeKey) {
    handleSelect(archetypeKey)
    setOpenKey(null)
  }

  function handleSelect(archetypeKey: ArchetypeKey) {
    if (archetypeKey === optimisticKey) return
    write({
      surface: "originArchetype",
      optimistic: () => setOptimisticKey(archetypeKey),
      action: (expectedVersion) =>
        setOriginArchetypeAction({
          characterId,
          archetypeKey,
          expectedVersion,
        }),
      messages: {
        stale:
          "Someone else updated this character — refresh to see the latest.",
        error: "Couldn't save your Origin. Try again.",
      },
      onError: (error) => {
        if (error === "character-not-found") {
          toast.error("This character was deleted.")
          return true
        }
        return false
      },
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 font-heading text-lg font-medium text-foreground">
          <Sparkle className="size-3 text-gold" />
          Origin Archetype
        </h2>
        <p className="text-xs text-muted-foreground">
          Sorted by fit with your{" "}
          <span className="text-foreground">
            {PATH_CHOICE_LABELS[pathChoice]}
          </span>{" "}
          path.
        </p>
      </header>

      <MotionConfig reducedMotion="user">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((archetype) => (
            <motion.li
              key={archetype.key}
              layout
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              data-archetype={archetype.key}
            >
              <ArchetypeCard
                archetype={archetype}
                selected={archetype.key === optimisticKey}
                onOpen={() => setOpenKey(archetype.key)}
              />
            </motion.li>
          ))}
        </ul>
      </MotionConfig>

      <ArchetypeDialog
        archetype={open}
        pathChoice={pathChoice}
        selected={open?.key === optimisticKey}
        pending={pending}
        onChoose={() => open && handleChoose(open.key)}
        onClose={() => setOpenKey(null)}
      />
    </section>
  )
}
