"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"

import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"
import {
  buildLineageAtlas,
  filterAtlasLineagesToUnlocked,
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
 * The Lineage Atlas root (UNN-239): the canonical roster/tree for a character's
 * Archetypes. Reads the optimistic character, shapes it with
 * {@link buildLineageAtlas}, and lays out the Lineage sidebar, the selected
 * Lineage's tree, and the detail panel. An "Unlocked only" filter collapses the
 * trees to what the character has unlocked — the role the retired Archetypes-tab
 * roster used to play (UNN-276).
 *
 * Publicly viewable, read-only for non-owners (UNN-276): the *planning chrome*
 * — the Saved-Ranks strip, recommendation slots, and the detail panel's action
 * footer — is gated behind {@link OwnerOnly}; the map itself shows for everyone.
 * The write actions behind that chrome already enforce `requireOwner`
 * server-side, so the gating is affordance-only.
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
  const [unlockedOnly, setUnlockedOnly] = useState(false)

  const displayLineages = unlockedOnly
    ? filterAtlasLineagesToUnlocked(view.lineages)
    : view.lineages
  // The user's last explicit pick wins; fall back when the filter has dropped
  // the selected Lineage out of view — deriving (not setState-ing) keeps the
  // pick sticky across toggling.
  const lineage =
    displayLineages.find((entry) => entry.lineage === selectedLineage) ??
    displayLineages[0]
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

      <OwnerOnly>
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
      </OwnerOnly>

      <div className="flex items-center justify-end gap-2">
        <Label htmlFor="atlas-unlocked-only">Unlocked only</Label>
        <Switch
          id="atlas-unlocked-only"
          checked={unlockedOnly}
          onCheckedChange={setUnlockedOnly}
        />
      </div>

      {lineage ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[12rem_1fr]">
          <AtlasSidebar
            lineages={displayLineages}
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
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No Archetypes unlocked yet.
        </p>
      )}

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
