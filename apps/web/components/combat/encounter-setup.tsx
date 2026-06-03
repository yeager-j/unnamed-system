"use client"

import { XIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { applyCombatEvent } from "@/lib/actions/encounter/events"
import type { ApplyCombatEventError } from "@/lib/actions/encounter/events.schema"
import { saveEncounterSetupAction } from "@/lib/actions/encounter/setup"
import type { SaveEncounterSetupError } from "@/lib/actions/encounter/setup.schema"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import {
  toCombatantSetup,
  type CombatantSetup,
  type CombatSide,
} from "@/lib/game/encounter"

import { ImportPcsPanel } from "./import-pcs-panel"
import { SetupPanelStub } from "./setup-panels"
import { SideToggle } from "./side-toggle"

type SetupError = SaveEncounterSetupError | ApplyCombatEventError

function errorMessage(error: SetupError): string {
  switch (error) {
    case "campaign-already-has-live-encounter":
      return "This campaign already has a live encounter."
    case "stale":
      return "This encounter changed elsewhere. Reload and try again."
    case "encounter-not-found":
      return "This encounter no longer exists."
    case "invalid-input":
      return "Something looks off with the roster. Try again."
  }
}

/**
 * The encounter **setup shell** (UNN-335/298/300/302): the load-bearing frame the
 * rest of Phase 4 plugs into. It owns the in-progress `CombatantSetup[]` (seeded
 * from the persisted session so a resumed draft is restored), hosts the
 * Import-PCs panel (UNN-298) + the per-combatant side control (UNN-300), and
 * persists the roster (UNN-302).
 *
 * **Save draft** persists the assembled roster (`saveEncounterSetupAction`,
 * version-guarded) without leaving `draft`. **Start combat** saves first, then
 * dispatches `startCombat` through `applyCombatEvent` (which flips `status →
 * live`, rejecting if the campaign already has a live encounter) and refreshes so
 * the route re-reads the new status. Both writes thread the encounter's single
 * `version`. The opening advantage is a placeholder (`neutral`/`players`) — the
 * DM advantage UI is a later concern; enemies (UNN-299) and zones (UNN-301) are
 * still stubs.
 */
export function EncounterSetup({
  encounter,
  placedCharacters,
}: {
  encounter: EncounterRow
  placedCharacters: CharacterSummary[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [version, setVersion] = useState(encounter.version)
  const [combatants, setCombatants] = useState<CombatantSetup[]>(() =>
    encounter.session.combatants.map(toCombatantSetup)
  )

  const placedById = new Map(
    placedCharacters.map((character) => [character.id, character])
  )

  const addedCharacterIds = new Set(
    combatants.flatMap((combatant) =>
      combatant.ref.kind === "pc" ? [combatant.ref.characterId] : []
    )
  )

  const canStart = combatants.length > 0

  function combatantLabel(setup: CombatantSetup): string {
    switch (setup.ref.kind) {
      case "pc":
        return (
          placedById.get(setup.ref.characterId)?.name ?? setup.ref.characterId
        )
      case "enemy":
        return setup.ref.statBlock.name
      case "catalog-enemy":
        return setup.ref.enemyKey
    }
  }

  function togglePc(characterId: string) {
    setCombatants((current) => {
      const isAdded = current.some(
        (combatant) =>
          combatant.ref.kind === "pc" &&
          combatant.ref.characterId === characterId
      )
      return isAdded
        ? current.filter(
            (combatant) =>
              !(
                combatant.ref.kind === "pc" &&
                combatant.ref.characterId === characterId
              )
          )
        : [
            ...current,
            { side: "players", ref: { kind: "pc", characterId }, zoneId: "" },
          ]
    })
  }

  function setSide(index: number, side: CombatSide) {
    setCombatants((current) =>
      current.map((combatant, i) =>
        i === index ? { ...combatant, side } : combatant
      )
    )
  }

  function removeCombatant(index: number) {
    setCombatants((current) => current.filter((_, i) => i !== index))
  }

  async function persist(): Promise<number | null> {
    const saved = await saveEncounterSetupAction({
      encounterId: encounter.id,
      expectedVersion: version,
      combatants,
    })
    if (!saved.ok) {
      toast.error(errorMessage(saved.error))
      return null
    }
    setVersion(saved.value.version)
    return saved.value.version
  }

  function onSaveDraft() {
    startTransition(async () => {
      const nextVersion = await persist()
      if (nextVersion !== null) toast.success("Draft saved.")
    })
  }

  function onStart() {
    startTransition(async () => {
      const nextVersion = await persist()
      if (nextVersion === null) return

      const started = await applyCombatEvent({
        encounterId: encounter.id,
        expectedVersion: nextVersion,
        event: {
          kind: "startCombat",
          advantage: "neutral",
          firstSide: "players",
        },
      })
      if (!started.ok) {
        toast.error(errorMessage(started.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-medium">{encounter.name}</h1>
          <p className="text-sm text-muted-foreground">Encounter setup</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSaveDraft} disabled={isPending}>
            {isPending ? <Spinner /> : null}
            Save draft
          </Button>
          <Button onClick={onStart} disabled={!canStart || isPending}>
            {isPending ? <Spinner /> : null}
            Start combat
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ImportPcsPanel
          placedCharacters={placedCharacters}
          addedCharacterIds={addedCharacterIds}
          onToggle={togglePc}
        />
        <SetupPanelStub title="Add enemies" ticket="UNN-299" />
        <SetupPanelStub title="Zones" ticket="UNN-301" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-medium">
          Combatants ({combatants.length})
        </h2>
        {combatants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No combatants yet — add at least one to start combat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {combatants.map((combatant, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {combatantLabel(combatant)}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <SideToggle
                    side={combatant.side}
                    onChange={(side) => setSide(index, side)}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove combatant"
                    onClick={() => removeCombatant(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
