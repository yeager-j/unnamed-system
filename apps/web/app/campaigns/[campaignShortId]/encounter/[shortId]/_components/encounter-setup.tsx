"use client"

import { PlusIcon, SkullIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"

import {
  compareInitiative,
  isRosterFullyPlaced,
} from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import { adjacencyMap } from "@workspace/game-v2/spatial/selectors"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { StartCombatDialog } from "@/components/combat/dialogs/start-combat"
import { ImportPcsPanel } from "@/components/combat/setup/import-pcs-panel"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { buildSetupRows } from "@/domain/combat/view/setup-view"
import { resolveSession } from "@/domain/game-engine-v2"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import { encounterSetupPath } from "@/lib/paths"

import { CombatantSetupRow } from "./combatant-setup-row"
import { useEncounterSetup } from "./use-encounter-setup"
import { ZonesPanel, type ZoneGraphEvent } from "./zones-panel"

/**
 * The encounter **setup shell** (UNN-335/347), on engine v2 (UNN-535). Every
 * edit is an event dispatched through the same optimistic
 * `applyCombatEventAction` path the live console uses ({@link
 * useEncounterSetup}) — no Save button, a resumed draft restores straight from
 * the persisted session.
 *
 * v2 gesture mapping: a **PC add** is the durable wire arm (`{ entityId }`,
 * client-minted roster id; no optimistic roster mirror — the client holds no
 * entity to build the row from, so the joiner lands with the revalidation,
 * R6.2); **placement** is the upserting `placeCombatant` (add-then-place — an
 * add lands unplaced and a later placement mints its token); **staged
 * engagement** composes a paired add (always `free`) with an explicit
 * `setEngagement` — queue serialization guarantees order. The Start gate
 * mirrors the server's {@link isRosterFullyPlaced} client-side; the initiative
 * suggestion is v2's {@link compareInitiative} over the resolved session (no
 * more injected PC stats).
 */
export function EncounterSetup({
  data,
  campaignShortId,
  placedCharacters,
}: {
  data: EncounterForDM
  campaignShortId: string
  placedCharacters: CharacterSummary[]
}) {
  const router = useRouter()
  const { state, isPending, dispatch } = useEncounterSetup(data)

  const view = resolveSession(state.session, state.mapInstance)
  const rows = buildSetupRows(
    state.session,
    view,
    state.mapInstance,
    data.participantMeta
  )
  const zones = state.mapInstance.geometry.zones
  const adjacency = adjacencyMap(state.mapInstance.geometry)

  const addedCharacterIds = new Set(
    rows.flatMap((row) => (row.characterId !== null ? [row.characterId] : []))
  )

  const placed = isRosterFullyPlaced(state.session, state.mapInstance)
  const canStart = rows.length > 0 && placed
  const comparison = compareInitiative(view)

  function togglePc(characterId: string) {
    const existing = rows.find((row) => row.characterId === characterId)
    if (existing !== undefined) {
      dispatch({ kind: "removeParticipant", participantId: existing.id })
      return
    }
    dispatch({
      kind: "addParticipant",
      setup: {
        id: asParticipantId(crypto.randomUUID()),
        side: "players",
        entityId: characterId,
      },
    })
  }

  function setSide(participantId: ParticipantId, side: CombatSide) {
    dispatch({ kind: "setSide", participantId, side })
  }

  function setZone(participantId: ParticipantId, zoneId: string) {
    dispatch({ kind: "placeCombatant", tokenKey: participantId, zoneId })
  }

  function setEngagement(participantId: ParticipantId, engagement: Engagement) {
    dispatch(
      engagement.status === "engaged"
        ? {
            kind: "setEngagement",
            tokenKey: participantId,
            targetCombatantIds: engagement.targetCombatantIds,
          }
        : { kind: "clearEngagement", tokenKey: participantId }
    )
  }

  function removeParticipant(participantId: ParticipantId) {
    dispatch({ kind: "removeParticipant", participantId })
  }

  function dispatchZoneEvent(event: ZoneGraphEvent) {
    dispatch(
      event.kind === "addZone"
        ? { ...event, zoneId: crypto.randomUUID() }
        : event
    )
  }

  function browseCatalog() {
    router.push(encounterSetupPath(campaignShortId, data.encounter.shortId))
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
          <h1 className="font-heading text-lg font-medium">
            {data.encounter.name}
          </h1>
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
            Combatants ({rows.length})
          </h2>
          {!placed ? (
            <p className="text-xs text-muted-foreground">
              Place every combatant in a zone to start.
            </p>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No combatants yet — add at least one to start combat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <CombatantSetupRow
                key={row.id}
                label={row.label}
                side={row.side}
                zones={zones}
                zoneId={row.zoneId}
                engagement={row.engagement}
                engagementOptions={row.engagementOptions}
                onSideChange={(side) => setSide(row.id, side)}
                onZoneChange={(zoneId) => setZone(row.id, zoneId)}
                onEngagementChange={(engagement) =>
                  setEngagement(row.id, engagement)
                }
                onRemove={() => removeParticipant(row.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
