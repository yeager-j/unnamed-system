"use client"

import { motion, MotionConfig } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"

import { sortArchetypesByPath } from "@workspace/game-v2/archetypes/display"

import {
  useEntityWrite,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"
import { creationArchetypes } from "@/domain/game-engine-v2"
import { PATH_CHOICE_LABELS } from "@/lib/ui/labels"

import { Sparkle } from "../../../shared/celestial"
import { ArchetypeCard } from "./archetype-card"
import { ArchetypeDialog } from "./archetype-dialog"

/**
 * The Movement 1 Origin Archetype grid (UNN-215 / ADR-002 §"The Archetype
 * grid"). Renders every creation-eligible (initiate-tier) Archetype as a
 * compact card in a 3-col grid (1-col mobile). Tapping a card opens an
 * {@link ArchetypeDialog} with the full detail and a "Choose [Lineage] as
 * Origin" CTA; choosing commits the Origin and closes the dialog. The selected
 * Archetype keeps its compact-card check regardless of which (if any) card is
 * currently open.
 *
 * Sort responds to the path choice: a Health-Focused player sees HP-matched
 * Lineages first (see {@link sortArchetypesByPath}). A draft's skeleton always
 * carries a Path (defaulted to `"balanced"` by the mint), so this never sees
 * an absent one. Selection dispatches an `archetypes.setOrigin` descriptor
 * (progression class) and reads back off the shared optimistic frame.
 */
export function ArchetypeGrid() {
  const { entity } = useLoadedCharacter()
  const { pending, dispatch } = useEntityWrite()
  const pathChoice = entity.components.path?.choice ?? "balanced"
  const optimisticKey = entity.components.archetypes?.origin ?? null
  const [openKey, setOpenKey] = useState<string | null>(null)

  const sorted = sortArchetypesByPath(creationArchetypes(), pathChoice)
  const open = sorted.find((a) => a.key === openKey) ?? null

  function handleChoose(archetypeKey: string) {
    handleSelect(archetypeKey)
    setOpenKey(null)
  }

  function handleSelect(archetypeKey: string) {
    if (archetypeKey === optimisticKey) return
    dispatch(
      { component: "archetypes", op: "setOrigin", archetypeKey },
      {
        messages: {
          stale:
            "Someone else updated this character — refresh to see the latest.",
          error: "Couldn't save your Origin. Try again.",
        },
        onError: (error) => {
          if (error === "entity-not-found") {
            toast.error("This character was deleted.")
            return true
          }
          return false
        },
      }
    )
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
