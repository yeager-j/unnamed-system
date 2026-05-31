"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"

import { Separator } from "@workspace/ui/components/separator"

import { useCharacter } from "@/hooks/use-character"
import {
  buildLineageAtlas,
  getAtlasRecommendations,
  type AtlasLineage,
  type AtlasNode,
} from "@/lib/game/archetypes"

import { ArchetypeDetailPanel } from "./archetype-detail-panel"
import { AtlasSidebar } from "./atlas-sidebar"
import { LineageTree } from "./lineage-tree"
import { RanksHeader } from "./ranks-header"
import { RecommendationSlots } from "./recommendation-slots"

/**
 * The Lineage Atlas root (UNN-239): the owner's growth view for spending Saved
 * Archetype Ranks. Reads the optimistic character, shapes it with
 * {@link buildLineageAtlas}, and lays out the Saved-Ranks strip, recommendation
 * slots, the Lineage sidebar, the selected Lineage's tree, and the detail panel.
 *
 * Both write actions flow through the panel's (and slots') shared action
 * button, so an unlock or rank-up re-renders the tree, sidebar counts, and
 * Saved-Ranks counter from the same optimistic frame. Recommendation slots are
 * filled by {@link getAtlasRecommendations} (UNN-256), which returns fewer than
 * three picks — or none, leaving the slots' own empty state — when little is
 * actionable.
 */
export function LineageAtlas() {
  const character = useCharacter()
  const view = buildLineageAtlas(character)

  const [selectedLineage, setSelectedLineage] = useState<string>(
    () =>
      view.originLineage ??
      view.lineages.find((entry) => entry.progress.total > 0)?.lineage ??
      view.lineages[0]!.lineage
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const lineage =
    view.lineages.find((entry) => entry.lineage === selectedLineage) ??
    view.lineages[0]!
  const selectedNode = findNode(view.lineages, selectedKey)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/c/${character.shortId}?tab=archetypes`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden /> Back to sheet
        </Link>
        <h1 className="text-3xl font-bold">Lineage Atlas</h1>
      </div>

      <RanksHeader
        savedRanks={view.savedRanks}
        unlockedCount={view.unlockedCount}
        pathChoice={character.pathChoice}
      />

      <RecommendationSlots
        recommendations={getAtlasRecommendations(
          view,
          character.pathChoice,
          character.level
        )}
        pathChoice={character.pathChoice}
        savedRanks={view.savedRanks}
      />

      <Separator />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[12rem_1fr]">
        <AtlasSidebar
          lineages={view.lineages}
          selectedLineage={lineage.lineage}
          onSelect={(next) => {
            setSelectedLineage(next)
            setSelectedKey(null)
          }}
        />
        <LineageTree
          lineage={lineage}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
      </div>

      <ArchetypeDetailPanel
        node={selectedNode}
        savedRanks={view.savedRanks}
        attributes={character.attributes}
        pathChoice={character.pathChoice}
        onClose={() => setSelectedKey(null)}
      />
    </main>
  )
}

function findNode(
  lineages: AtlasLineage[],
  archetypeKey: string | null
): AtlasNode | null {
  if (!archetypeKey) return null
  for (const lineage of lineages) {
    for (const column of lineage.columns) {
      const node = column.nodes.find(
        (entry) => entry.archetype.key === archetypeKey
      )
      if (node) return node
    }
  }
  return null
}
