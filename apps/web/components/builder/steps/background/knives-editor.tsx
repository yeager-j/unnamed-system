"use client"

import {
  addCharacterKnifeAction,
  removeCharacterKnifeAction,
  updateCharacterKnifeAction,
} from "@/lib/actions/character-knives"
import type { CharacterKnifeRow } from "@/lib/db/load-character"

import { EntryListEditor, type EntryRow } from "./entry-list-editor"

/**
 * Knives editor (rulebook 1.4, PRD §5.1 step 3). External stakes — people,
 * places, things the character cares about deeply. Rules suggest ~7;
 * hard minimum 4, soft warning above 12.
 */
const KNIFE_MIN = 4
const KNIFE_SOFT_MAX = 12

export function KnivesEditor({
  characterId,
  identityVersion,
  knives,
}: {
  characterId: string
  identityVersion: number
  knives: CharacterKnifeRow[]
}) {
  const entries: EntryRow[] = knives.map((k) => ({
    id: k.id,
    title: k.title,
    description: k.description,
  }))

  return (
    <EntryListEditor
      characterId={characterId}
      identityVersion={identityVersion}
      initialEntries={entries}
      messages={{
        label: "Knives",
        description:
          "External stakes — people, places, or things your character cares about. Aim for ~7. Each Knife is a hook the DM can use to threaten you (and a Victory you can earn defending it).",
        singularLabel: "Knife",
        titlePlaceholder: "e.g. My younger sister Mira",
        descriptionPlaceholder: "Why does this matter? What's at stake?",
        newEntryTitle: "New Knife",
        addLabel: "Add Knife",
        softWarning: "more than 12 Knives will overwhelm your DM.",
        softMax: KNIFE_SOFT_MAX,
        recommendedMin: KNIFE_MIN,
        saveError: "Couldn't save the Knife. Try again.",
      }}
      addEntry={async (title, expectedVersion) => {
        const result = await addCharacterKnifeAction({
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
      updateEntry={async (knifeId, title, description, expectedVersion) => {
        const result = await updateCharacterKnifeAction({
          characterId,
          knifeId,
          title,
          description: description ?? undefined,
          expectedVersion,
        })
        if (result.ok) {
          return { ok: true, value: { version: result.value.version } }
        }
        return result
      }}
      removeEntry={async (knifeId, expectedVersion) => {
        const result = await removeCharacterKnifeAction({
          characterId,
          knifeId,
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
