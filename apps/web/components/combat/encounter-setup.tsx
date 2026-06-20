"use client"

import { PlusIcon, SkullIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"

import {
  adjacencyMap,
  buildSetupCombatantLabels,
  compareInitiative,
  engageableTargets,
  isRosterFullyPlaced,
  toCombatantSetup,
  type InitiativeStats,
} from "@workspace/game/engine"
import {
  type CombatAdvantage,
  type CombatSide,
  type Engagement,
  type ZoneGraphEvent,
} from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { resolveCatalogEnemyStatblocks } from "@/lib/game-engine"

import { CombatantSetupRow } from "./combatant-setup-row"
import { ImportPcsPanel } from "./import-pcs-panel"
import { StartCombatDialog } from "./start-combat-dialog"
import { useEncounterSetup } from "./use-encounter-setup"
import { ZonesPanel } from "./zones-panel"

/**
 * The encounter **setup shell** (UNN-335/298/300/301/302/347): the load-bearing
 * frame the rest of Phase 4 plugs into. Every edit — add/remove a combatant, set
 * its side, place it in a zone, set its initial engagement, author the zone graph
 * — is now a {@link import("@workspace/game/foundation").CombatEvent} dispatched
 * through the **same** optimistic `applyCombatEvent` path the live console uses
 * ({@link useEncounterSetup}). There is **no Save button**: the roster is always
 * persisted, so a resumed draft is restored straight from `encounter.session` and
 * navigation never loses an edit.
 *
 * The shell renders straight from the optimistic `session`: the roster projects
 * back to `CombatantSetup`s via {@link toCombatantSetup}, and zones/adjacency come
 * off the same session. New combatants and zones carry a **client-minted** stable
 * id on their event so the optimistic id matches the persisted one — a follow-up
 * placement/adjacency edit can reference it before the refresh lands (UNN-347).
 *
 * **Start combat** opens the {@link StartCombatDialog} where the DM declares the
 * opening advantage + first side (UNN-303 / rulebook 3.2); confirming dispatches
 * `startCombat` (which flips `status → live`, rejecting if the campaign already
 * has a live encounter, or if zones are defined and any combatant is unplaced).
 * The client gates Start on {@link isRosterFullyPlaced} as the friendly
 * affordance; the server enforces it authoritatively.
 */
export function EncounterSetup({
  encounter,
  instance,
  campaignShortId,
  placedCharacters,
  pcStatsById,
}: {
  encounter: EncounterRow
  instance: MapInstanceRow
  campaignShortId: string
  placedCharacters: CharacterSummary[]
  pcStatsById: Record<string, InitiativeStats>
}) {
  const router = useRouter()
  const {
    session,
    instance: instanceState,
    isPending,
    dispatch,
  } = useEncounterSetup(encounter, instance)

  const combatants = session.combatants.map((combatant) =>
    toCombatantSetup(combatant, instanceState.occupancy[combatant.id])
  )
  const zones = instanceState.geometry.zones
  const adjacency = adjacencyMap(instanceState.geometry)

  const addedCharacterIds = new Set(
    combatants.flatMap((combatant) =>
      combatant.ref.kind === "pc" ? [combatant.ref.characterId] : []
    )
  )

  const enemyStatblockById = resolveCatalogEnemyStatblocks(combatants)
  const placed = isRosterFullyPlaced(combatants, zones)
  const canStart = combatants.length > 0 && placed
  const comparison = compareInitiative(
    combatants,
    pcStatsById,
    enemyStatblockById
  )

  const pcNameById = Object.fromEntries(
    placedCharacters.map((character) => [character.id, character.name])
  )
  const combatantLabels = buildSetupCombatantLabels(
    combatants,
    pcNameById,
    enemyStatblockById
  )

  function togglePc(characterId: string) {
    const existing = combatants.find(
      (combatant) =>
        combatant.ref.kind === "pc" && combatant.ref.characterId === characterId
    )
    if (existing?.id !== undefined) {
      dispatch({ kind: "removeCombatant", combatantId: existing.id })
      return
    }
    dispatch({
      kind: "addCombatant",
      setup: {
        id: crypto.randomUUID(),
        side: "players",
        ref: { kind: "pc", characterId },
        zoneId: "",
      },
    })
  }

  function setSide(combatantId: string, side: CombatSide) {
    dispatch({ kind: "setSide", combatantId, side })
  }

  function setZone(combatantId: string, zoneId: string) {
    dispatch({ kind: "moveCombatant", combatantId, toZoneId: zoneId })
  }

  function setEngagement(combatantId: string, engagement: Engagement) {
    dispatch(
      engagement.status === "engaged"
        ? {
            kind: "setEngagement",
            combatantId,
            targetCombatantIds: engagement.targetCombatantIds,
          }
        : { kind: "clearEngagement", combatantId }
    )
  }

  function removeCombatant(combatantId: string) {
    dispatch({ kind: "removeCombatant", combatantId })
  }

  function dispatchZoneEvent(event: ZoneGraphEvent) {
    dispatch(
      event.kind === "addZone"
        ? { ...event, zoneId: crypto.randomUUID() }
        : event
    )
  }

  function browseCatalog() {
    router.push(`/combat/${encounter.shortId}/enemies`)
  }

  function start(advantage: CombatAdvantage, firstSide: CombatSide) {
    dispatch({ kind: "startCombat", advantage, firstSide })
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
          {isPending ? <Spinner className="text-muted-foreground" /> : null}
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
            <Button variant="outline" onClick={browseCatalog}>
              <SkullIcon weight="bold" />
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
        />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-sm font-medium">
            Combatants ({combatants.length})
          </h2>
          {!placed ? (
            <p className="text-xs text-muted-foreground">
              Place every combatant in a zone to start.
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
                key={combatant.id}
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
                onSideChange={(side) => setSide(combatant.id!, side)}
                onZoneChange={(zoneId) => setZone(combatant.id!, zoneId)}
                onEngagementChange={(engagement) =>
                  setEngagement(combatant.id!, engagement)
                }
                onRemove={() => removeCombatant(combatant.id!)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
