"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { applyCombatEvent } from "@/lib/actions/encounter/events"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { Combatant, CombatantSetup } from "@/lib/game/encounter"

import { SetupPanelStub } from "./setup-panels"

/**
 * Projects a persisted {@link Combatant} back down to the {@link CombatantSetup}
 * the setup shell edits — the inverse of `makeCombatant`. The shell only owns
 * the setup-shaped fields (side, identity, position, engagement); the rest of
 * the overlay is the reducer's to manage once combat is live.
 */
function toSetup(combatant: Combatant): CombatantSetup {
  return {
    side: combatant.side,
    ref: combatant.ref,
    zoneId: combatant.zoneId,
    engagement: combatant.engagement,
  }
}

/** A throwaway combatant the stub panels add so the skeleton flow is testable
 *  before the real Import-PCs / Add-enemies panels (UNN-298/299) land. */
function placeholderCombatant(index: number): CombatantSetup {
  return {
    side: "enemies",
    ref: {
      kind: "enemy",
      statBlock: {
        name: `Placeholder enemy ${index + 1}`,
        maxHP: 10,
        currentHP: 10,
        maxSP: 0,
        currentSP: 0,
        attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
      },
    },
    zoneId: "zone-1",
  }
}

function combatantLabel(setup: CombatantSetup): string {
  switch (setup.ref.kind) {
    case "pc":
      return `PC ${setup.ref.characterId}`
    case "enemy":
      return setup.ref.statBlock.name
    case "catalog-enemy":
      return setup.ref.enemyKey
  }
}

/**
 * The encounter **setup shell** (UNN-335): the real, load-bearing frame the rest
 * of Phase 4 plugs into. It owns the in-progress `CombatantSetup[]` state
 * container (seeded from the encounter's persisted session so a resumed draft is
 * non-empty), hosts the four named setup-panel slots (UNN-298/299/300/301, stubs
 * for now), and wires the **Start combat** button to the `draft → live`
 * transition.
 *
 * Start dispatches the existing `startCombat` event through `applyCombatEvent`
 * (UNN-332), which flips the DB `status` to `live`; the client then
 * `router.refresh()`es so the route's RSC re-reads the new status and renders the
 * live console. The opening `advantage` / `firstSide` are placeholders here —
 * the real selection UI is UNN-303 — and the explicit save of the assembled
 * roster is UNN-302, so combatants added via the stub panels are not yet
 * persisted.
 */
export function EncounterSetup({ encounter }: { encounter: EncounterRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [combatants, setCombatants] = useState<CombatantSetup[]>(() =>
    encounter.session.combatants.map(toSetup)
  )

  const everyCombatantPlaced = combatants.every(
    (combatant) => combatant.side && combatant.zoneId.length > 0
  )
  const canStart = combatants.length > 0 && everyCombatantPlaced

  function addPlaceholder() {
    setCombatants((current) => [
      ...current,
      placeholderCombatant(current.length),
    ])
  }

  function onStart() {
    startTransition(async () => {
      const result = await applyCombatEvent({
        encounterId: encounter.id,
        expectedVersion: encounter.version,
        event: {
          kind: "startCombat",
          advantage: "neutral",
          firstSide: "players",
        },
      })
      if (!result.ok) {
        toast.error("Couldn't start combat. Reload and try again.")
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
        <Button onClick={onStart} disabled={!canStart || isPending}>
          {isPending ? <Spinner /> : null}
          Start combat
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SetupPanelStub title="Import PCs" ticket="UNN-298">
          <Button size="sm" variant="outline" onClick={addPlaceholder}>
            Add placeholder combatant
          </Button>
        </SetupPanelStub>
        <SetupPanelStub title="Add enemies" ticket="UNN-299" />
        <SetupPanelStub title="Sides" ticket="UNN-300" />
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
          <ul className="flex flex-col gap-1 text-sm">
            {combatants.map((combatant, index) => (
              <li
                key={index}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span>{combatantLabel(combatant)}</span>
                <span className="text-xs text-muted-foreground">
                  {combatant.side} · {combatant.zoneId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
