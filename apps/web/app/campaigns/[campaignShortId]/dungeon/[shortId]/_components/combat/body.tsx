"use client"

import { useState } from "react"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err } from "@workspace/game-v2/kernel/result"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { SidebarInset } from "@workspace/ui/components/sidebar"

import { DungeonCanvas } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas"
import { DungeonCombatCanvasProvider } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/context"
import { CombatSpinePanel } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/spine-panel"
import { CombatTurnBar } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/turn-bar"
import { DungeonCombatSidebar } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/sidebar"
import { DungeonSidebarSlot } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell"
import {
  useCombatConsole,
  type EndCombatPerformer,
} from "@/components/combat/console/use-combat-console"
import { useCombatSelection } from "@/components/combat/console/use-combat-selection"
import { EndOfTurnModal } from "@/components/combat/dialogs/end-of-turn-modal"
import { CombatantDrawer } from "@/components/combat/drawer/combatant-drawer"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import type { EndCombatError } from "@/lib/actions/combat/end-combat.schema"
import { endDungeonCombatAction } from "@/lib/actions/dungeon/end-combat"
import type { EndDungeonCombatError } from "@/lib/actions/dungeon/end-combat.schema"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import { dungeonWatchPath } from "@/lib/paths"
import { RealtimeChannelListener } from "@/lib/sync/use-realtime-channel"
import { COMBAT_DRAFT_HEADINGS } from "@/lib/ui/labels"

/**
 * The run console's **combat phase** on engine v2 (UNN-536) — a morph of the same
 * shell that drives exploration, layered over the **same** Map Instance the delve
 * uses. The left panel becomes the {@link DungeonCombatSidebar} (combatant rail),
 * the canvas renders the battlefield (combat tokens, the acting badge, Engaged
 * clusters, click-to-move for the acting combatant), and the top + bottom Panels
 * drive the side-alternating draft turn loop.
 *
 * It reuses the mapless console engine wholesale — {@link useCombatConsole} owns
 * the optimistic write path **and** the shared view derivation (turn order /
 * roster / phase / selection / obligations), and the {@link CombatantDrawer} /
 * {@link EndOfTurnModal} render unchanged. The **one** route-varying seam is the
 * combat-end: it injects the three-row {@link endDungeonCombatAction} (which also
 * advances the delve turn) through `options.endCombat`, collapsing its two
 * delve-only error codes to the shared {@link EndCombatError} at this boundary.
 */
export function DungeonCombatBody({
  dungeon,
  data,
  combatantSheetSliceById,
  campaignShortId,
}: {
  dungeon: DungeonRow
  data: EncounterForDM
  combatantSheetSliceById: Record<ParticipantId, CombatantSheetSlice>
  campaignShortId: string
}) {
  const endCombat: EndCombatPerformer = async ({
    encounterVersion,
    instanceVersion,
  }) => {
    const result = await endDungeonCombatAction({
      encounterId: data.encounter.id,
      dungeonId: dungeon.id,
      expectedEncounterVersion: encounterVersion,
      expectedInstanceVersion: instanceVersion,
      expectedDungeonVersion: dungeon.version,
    })
    return result.ok ? result : err(toEndCombatError(result.error))
  }

  const {
    session,
    instance: instanceState,
    resolved,
    isPending,
    dispatch,
    dispatchWrite,
    endEncounter,
    onPcPing,
    view,
    currentActor,
    roster,
    fallenPcNames,
    obligations,
    pcChannelIds,
    onDraft,
    onAdvanceRound,
  } = useCombatConsole(data, { endCombat })

  const {
    phase,
    selectedDetail,
    selectCombatant,
    endOfTurnOpen,
    closeEndOfTurn,
    onEndTurn,
  } = useCombatSelection({
    session,
    resolved,
    instance: instanceState,
    participantMeta: data.participantMeta,
    combatantSheetSliceById,
    currentActor,
    dispatch,
  })

  const [moveAnywhere, setMoveAnywhere] = useState(false)

  const actingCombatantId =
    phase === "active" ? (currentActor?.id ?? null) : null
  const movableZoneIds = movableZonesFor(
    instanceState,
    actingCombatantId,
    moveAnywhere
  )

  return (
    <>
      {pcChannelIds.map(({ characterId, shortId }) => (
        <RealtimeChannelListener
          key={shortId}
          domain="character"
          shortId={shortId}
          onPing={(data) => onPcPing(characterId, data)}
        />
      ))}

      <DungeonSidebarSlot>
        <DungeonCombatSidebar
          roster={roster}
          dungeonName={dungeon.name}
          campaignShortId={campaignShortId}
          round={session.round}
          onSelectCombatant={selectCombatant}
        />
      </DungeonSidebarSlot>

      <SidebarInset className="relative">
        <DungeonCombatCanvasProvider
          value={{
            round: session.round,
            phase,
            draftHeading: COMBAT_DRAFT_HEADINGS[view.draftingSide],
            actingName: currentActor?.name ?? null,
            turnRows: view.rows,
            roundComplete: view.roundComplete,
            onDraft,
            onAdvanceRound,
            onEndTurn,
            actingCombatantId,
            movableZoneIds,
            moveAnywhere,
            onToggleMoveAnywhere: () => setMoveAnywhere((prev) => !prev),
            onMoveActing: (toZoneId) => {
              if (actingCombatantId === null) return
              dispatch({
                kind: "moveCombatant",
                tokenKey: actingCombatantId,
                toZoneId,
              })
            },
            onSelectCombatant: selectCombatant,
            onCombatEvent: dispatch,
            playerViewHref: dungeonWatchPath(campaignShortId, dungeon.shortId),
            onEndEncounter: endEncounter,
            turnCounter: dungeon.state.turnCounter,
            fallenPcNames,
            disabled: isPending,
          }}
        >
          <div className="absolute inset-0">
            <DungeonCanvas
              instance={instanceState}
              mode={{ kind: "combat", roster }}
              persistKey={dungeon.shortId}
              bar={
                <>
                  <CombatSpinePanel />
                  <CombatTurnBar />
                </>
              }
            />
          </div>
        </DungeonCombatCanvasProvider>
      </SidebarInset>

      <CombatantDrawer
        detail={selectedDetail}
        onClose={() => selectCombatant(null)}
        onCombatEvent={dispatch}
        dispatchWrite={dispatchWrite}
      />

      {currentActor ? (
        <EndOfTurnModal
          actorId={currentActor.id}
          actorName={currentActor.name}
          obligations={obligations}
          open={endOfTurnOpen}
          onCombatEvent={dispatch}
          onApplyHp={(apply) =>
            void dispatchWrite(currentActor.id, {
              component: "vitals",
              op: apply.delta < 0 ? "damage" : "heal",
              amount: Math.abs(apply.delta),
            })
          }
          isPending={isPending}
          onDone={closeEndOfTurn}
        />
      ) : null}
    </>
  )
}

/** The two delve-only end-combat codes have no mapless toast; collapse them to the
 *  nearest shared code so `combatErrorMessage` stays the single toast home. */
function toEndCombatError(error: EndDungeonCombatError): EndCombatError {
  if (error === "dungeon-not-found" || error === "encounter-not-on-dungeon") {
    return "encounter-not-found"
  }
  return error
}

/** The zones the acting combatant may move into — its adjacent zones, or every
 *  other zone when the override is on. Empty while nobody is acting. */
function movableZonesFor(
  instance: MapInstanceState,
  actingCombatantId: ParticipantId | null,
  moveAnywhere: boolean
): string[] {
  if (actingCombatantId === null) return []
  const currentZoneId = instance.occupancy[actingCombatantId]?.zoneId
  const allZoneIds = Object.keys(instance.geometry.zones)
  if (moveAnywhere) {
    return allZoneIds.filter((zoneId) => zoneId !== currentZoneId)
  }
  const adjacent = new Set<string>()
  for (const connection of Object.values(instance.geometry.connections)) {
    if (connection.fromZoneId === currentZoneId)
      adjacent.add(connection.toZoneId)
    else if (connection.toZoneId === currentZoneId)
      adjacent.add(connection.fromZoneId)
  }
  return [...adjacent]
}
