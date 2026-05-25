"use client"

import {
  addCharacterChainAction,
  removeCharacterChainAction,
  updateCharacterChainAction,
} from "@/lib/actions/character-chains"
import type { CharacterChainRow } from "@/lib/db/load-character"

import { EntryListEditor, type EntryRow } from "./entry-list-editor"

/**
 * Chains editor (rulebook 1.4, PRD §5.1 step 3). Internal limitations —
 * fears, wounds, vows the character carries. At least 1 Chain; soft
 * warning above 3 (rulebook says "one significant Chain or several
 * smaller ones", and breaking all Chains unlocks the Paragon tier).
 */
const CHAIN_MIN = 1
const CHAIN_SOFT_MAX = 3

export function ChainsEditor({
  characterId,
  identityVersion,
  chains,
}: {
  characterId: string
  identityVersion: number
  chains: CharacterChainRow[]
}) {
  const entries: EntryRow[] = chains.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
  }))

  return (
    <EntryListEditor
      characterId={characterId}
      identityVersion={identityVersion}
      initialEntries={entries}
      messages={{
        label: "Chains",
        description:
          "Internal limitations — fears, wounds, vows you've internalized. You can carry one significant Chain or several smaller ones. Breaking all your Chains unlocks the Paragon tier.",
        singularLabel: "Chain",
        titlePlaceholder: "e.g. The fear that I'm unworthy of love",
        descriptionPlaceholder:
          "What does this Chain do to you? Where did it come from?",
        newEntryTitle: "New Chain",
        addLabel: "Add Chain",
        softWarning:
          "consider whether they could collapse into a single, weightier Chain.",
        softMax: CHAIN_SOFT_MAX,
        recommendedMin: CHAIN_MIN,
        saveError: "Couldn't save the Chain. Try again.",
      }}
      addEntry={async (title, expectedVersion) => {
        const result = await addCharacterChainAction({
          characterId,
          title,
          expectedVersion,
        })
        if (result.ok) {
          return {
            ok: true,
            value: { id: result.value.id, version: result.value.version },
          }
        }
        return result
      }}
      updateEntry={async (chainId, title, description, expectedVersion) => {
        const result = await updateCharacterChainAction({
          characterId,
          chainId,
          title,
          description: description ?? undefined,
          expectedVersion,
        })
        if (result.ok) {
          return { ok: true, value: { version: result.value.version } }
        }
        return result
      }}
      removeEntry={async (chainId, expectedVersion) => {
        const result = await removeCharacterChainAction({
          characterId,
          chainId,
          expectedVersion,
        })
        if (result.ok) {
          return { ok: true, value: { version: result.value.version } }
        }
        return result
      }}
    />
  )
}
