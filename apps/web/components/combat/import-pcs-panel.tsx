"use client"

import { CheckIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr"

import { archetypeDisplayName } from "@workspace/game/data"
import { Button } from "@workspace/ui/components/button"

import type { CharacterSummary } from "@/lib/db/queries/character-list"

import { SetupPanelStub } from "./setup-panels"

/**
 * The Import-PCs setup panel (UNN-298): the campaign's *placed* characters, each
 * toggleable into the encounter roster as a `{ kind: "pc", characterId }`
 * combatant. Adding/removing only mutates the shell's in-progress
 * `CombatantSetup[]` — no DB write per toggle (the roster persists on Save /
 * Start, UNN-302). A PC already in the roster shows as added and can be removed.
 */
export function ImportPcsPanel({
  placedCharacters,
  addedCharacterIds,
  onToggle,
}: {
  placedCharacters: CharacterSummary[]
  addedCharacterIds: ReadonlySet<string>
  onToggle: (characterId: string) => void
}) {
  if (placedCharacters.length === 0) {
    return (
      <SetupPanelStub title="Import PCs" ticket="UNN-298">
        <p className="text-sm text-muted-foreground">
          No characters are placed in this campaign yet.
        </p>
      </SetupPanelStub>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-medium">Import PCs</h2>
        <span className="text-xs text-muted-foreground">
          {placedCharacters.length} placed
        </span>
      </header>
      <ul className="flex flex-col gap-2">
        {placedCharacters.map((character) => {
          const added = addedCharacterIds.has(character.id)
          return (
            <li
              key={character.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{character.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Level {character.level} ·{" "}
                  {archetypeDisplayName(character.activeArchetypeKey)}
                </p>
              </div>
              <Button
                size="sm"
                variant={added ? "secondary" : "outline"}
                onClick={() => onToggle(character.id)}
              >
                {added ? (
                  <CheckIcon weight="bold" />
                ) : (
                  <PlusIcon weight="bold" />
                )}
                {added ? "Added" : "Add"}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
