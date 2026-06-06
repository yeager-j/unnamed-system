"use client"

import { PlusIcon, SkullIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  buildSetupCombatantLabels,
  compareInitiative,
  engageableTargets,
  isRosterFullyPlaced,
  normalizeEngagements,
  setEngagementTargets,
  type InitiativeStats,
} from "@workspace/game/engine"
import {
  toCombatantSetup,
  type CombatAdvantage,
  type CombatantSetup,
  type CombatSide,
  type Engagement,
  type ZoneGraphEvent,
} from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import { applyCombatEvent } from "@/lib/actions/encounter/events"
import { saveEncounterSetupAction } from "@/lib/actions/encounter/setup"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { CampaignBackLink } from "./campaign-back-link"
import { CombatantSetupRow } from "./combatant-setup-row"
import { ImportPcsPanel } from "./import-pcs-panel"
import { StartCombatDialog } from "./start-combat-dialog"
import { ZonesPanel } from "./zones-panel"

/**
 * The encounter **setup shell** (UNN-335/298/300/301/302): the load-bearing frame
 * the rest of Phase 4 plugs into. It owns the in-progress `CombatantSetup[]`
 * (seeded from the persisted session so a resumed draft is restored), hosts the
 * Import-PCs panel (UNN-298), the per-combatant side control (UNN-300), zone
 * authoring + placement (UNN-301), and persists the roster (UNN-302).
 *
 * **Zones are server-owned.** Zone authoring emits UNN-313 `ZoneGraphEvent`s
 * through `applyCombatEvent` (the shared event path), so the panel renders
 * straight from `encounter.session.zones`/`adjacency` (props) and a
 * `router.refresh()` after each edit flows the server-minted zone ids back —
 * unlike the roster, which is client-owned until an explicit save. Placement
 * (`zoneId`) and initial `engagement` live on the client roster and persist with
 * it; the save action preserves the zone graph across rebuilds.
 *
 * **Save draft** persists the assembled roster (`saveEncounterSetupAction`,
 * version-guarded) without leaving `draft`. **Start combat** opens the
 * {@link StartCombatDialog} where the DM declares the opening advantage +
 * first side (UNN-303 / rulebook 3.2); confirming saves first, then dispatches
 * `startCombat` through `applyCombatEvent` (which flips `status → live`, rejecting
 * if the campaign already has a live encounter) and refreshes. Once any zone is
 * defined, both Save and Start are blocked until every combatant is placed
 * ({@link isRosterFullyPlaced}); an unzoned encounter stays startable.
 */
export function EncounterSetup({
  encounter,
  campaignShortId,
  placedCharacters,
  pcStatsById,
}: {
  encounter: EncounterRow
  campaignShortId: string
  placedCharacters: CharacterSummary[]
  pcStatsById: Record<string, InitiativeStats>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [version, setVersion] = useState(encounter.version)
  const [combatants, setCombatants] = useState<CombatantSetup[]>(() =>
    encounter.session.combatants.map(toCombatantSetup)
  )

  const zones = encounter.session.zones
  const adjacency = encounter.session.adjacency

  const addedCharacterIds = new Set(
    combatants.flatMap((combatant) =>
      combatant.ref.kind === "pc" ? [combatant.ref.characterId] : []
    )
  )

  const placed = isRosterFullyPlaced(combatants, zones)
  const canStart = combatants.length > 0 && placed
  const comparison = compareInitiative(combatants, pcStatsById)

  const pcNameById = Object.fromEntries(
    placedCharacters.map((character) => [character.id, character.name])
  )
  const combatantLabels = buildSetupCombatantLabels(combatants, pcNameById)

  function togglePc(characterId: string) {
    setCombatants((current) => {
      const isAdded = current.some(
        (combatant) =>
          combatant.ref.kind === "pc" &&
          combatant.ref.characterId === characterId
      )
      return isAdded
        ? normalizeEngagements(
            current.filter(
              (combatant) =>
                !(
                  combatant.ref.kind === "pc" &&
                  combatant.ref.characterId === characterId
                )
            )
          )
        : [
            ...current,
            {
              id: crypto.randomUUID(),
              side: "players",
              ref: { kind: "pc", characterId },
              zoneId: "",
            },
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

  function setZone(index: number, zoneId: string) {
    setCombatants((current) =>
      normalizeEngagements(
        current.map((combatant, i) =>
          i === index ? { ...combatant, zoneId } : combatant
        )
      )
    )
  }

  function setEngagement(index: number, engagement: Engagement) {
    const combatantId = combatants[index]?.id
    if (combatantId === undefined) return
    const targetIds =
      engagement.status === "engaged" ? engagement.targetCombatantIds : []
    setCombatants((current) =>
      setEngagementTargets(current, combatantId, targetIds)
    )
  }

  function removeCombatant(index: number) {
    setCombatants((current) =>
      normalizeEngagements(current.filter((_, i) => i !== index))
    )
  }

  async function persist(): Promise<number | null> {
    const saved = await saveEncounterSetupAction({
      encounterId: encounter.id,
      expectedVersion: version,
      combatants,
    })
    if (!saved.ok) {
      toast.error(encounterErrorMessage(saved.error))
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

  function dispatchZoneEvent(event: ZoneGraphEvent) {
    startTransition(async () => {
      const result = await applyCombatEvent({
        encounterId: encounter.id,
        expectedVersion: version,
        event,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      setVersion(result.value.version)
      router.refresh()
    })
  }

  function browseCatalog() {
    // Persist the in-progress roster first: the catalog sub-route reads the
    // *saved* session and appends to it, so unsaved PC toggles would be lost
    // without this.
    startTransition(async () => {
      const nextVersion = await persist()
      if (nextVersion !== null)
        router.push(`/combat/${encounter.shortId}/enemies`)
    })
  }

  function start(advantage: CombatAdvantage, firstSide: CombatSide) {
    startTransition(async () => {
      const nextVersion = await persist()
      if (nextVersion === null) return

      const started = await applyCombatEvent({
        encounterId: encounter.id,
        expectedVersion: nextVersion,
        event: { kind: "startCombat", advantage, firstSide },
      })
      if (!started.ok) {
        toast.error(encounterErrorMessage(started.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-medium">{encounter.name}</h1>
          <p className="text-sm text-muted-foreground">Encounter setup</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={isPending || !placed}
          >
            {isPending ? <Spinner /> : null}
            Save draft
          </Button>
          <StartCombatDialog
            comparison={comparison}
            onStart={start}
            disabled={!canStart || isPending}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ImportPcsPanel
          placedCharacters={placedCharacters}
          addedCharacterIds={addedCharacterIds}
          onToggle={togglePc}
        />
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <header className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-sm font-medium">Add enemies</h2>
          </header>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={browseCatalog}
              disabled={isPending}
            >
              {isPending ? <Spinner /> : <SkullIcon weight="bold" />}
              Browse catalog
            </Button>
            <Button variant="outline" disabled>
              <PlusIcon weight="bold" />
              Create custom
            </Button>
            <p className="text-xs text-muted-foreground">
              Custom enemies are coming soon (UNN-299).
            </p>
          </div>
        </section>
        <ZonesPanel
          zones={zones}
          adjacency={adjacency}
          onZoneEvent={dispatchZoneEvent}
          disabled={isPending}
        />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-medium">
            Combatants ({combatants.length})
          </h2>
          {!placed ? (
            <p className="text-xs text-muted-foreground">
              Place every combatant in a zone to save or start.
            </p>
          ) : null}
        </div>
        {combatants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No combatants yet — add at least one to start combat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {combatants.map((combatant, index) => (
              <CombatantSetupRow
                key={combatant.id ?? index}
                label={combatantLabels[index]!}
                side={combatant.side}
                zones={zones}
                zoneId={combatant.zoneId}
                engagement={combatant.engagement ?? { status: "free" }}
                engagementOptions={engageableTargets(
                  combatants,
                  index,
                  combatantLabels
                )}
                onSideChange={(side) => setSide(index, side)}
                onZoneChange={(zoneId) => setZone(index, zoneId)}
                onEngagementChange={(engagement) =>
                  setEngagement(index, engagement)
                }
                onRemove={() => removeCombatant(index)}
                disabled={isPending}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
