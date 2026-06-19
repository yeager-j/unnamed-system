"use client"

import { useMemo, useState } from "react"

import {
  adjacentZones,
  buildConsoleView,
  buildRosterView,
  combatantDetail,
  resolveZoneLayout,
  type PcCombatantDetail,
} from "@workspace/game/engine"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { CombatantDrawer } from "@/components/combat/combatant-drawer"
import { EndOfTurnModal } from "@/components/combat/end-of-turn-modal"
import { type ConsolePhase } from "@/components/combat/turn-order-strip"
import { useCombatConsole } from "@/components/combat/use-combat-console"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import {
  endOfTurnObligations,
  resolveCatalogEnemyStatblocks,
} from "@/lib/game-engine"
import { COMBAT_DRAFT_HEADINGS } from "@/lib/ui/labels"

import { CombatSpinePanel } from "./canvas/combat-spine-panel"
import { CombatTurnBar } from "./canvas/combat-turn-bar"
import { DungeonCanvas } from "./canvas/dungeon-canvas"
import { DungeonCombatCanvasProvider } from "./canvas/dungeon-combat-canvas-context"
import { DungeonAddCombatantDialog } from "./dungeon-add-combatant-dialog"
import { DungeonCombatSidebar } from "./dungeon-combat-sidebar"

/**
 * The run console's **combat phase** (UNN-467) — a morph of the same shell that
 * drives exploration, layered over the **same** Map Instance the delve uses. The
 * left panel becomes the {@link DungeonCombatSidebar} (combatant rail), the canvas
 * renders the battlefield (combat tokens, the acting badge, Engaged zones, and
 * click-to-move for the acting combatant), and the bottom + top Panels drive the
 * side-alternating draft turn loop. It reuses the standalone console's engine
 * wholesale — {@link useCombatConsole} for the dual-optimistic write path, the
 * turn-order/roster/zone-layout selectors, and the {@link CombatantDrawer} /
 * {@link EndOfTurnModal} — so the only new surface is the canvas chrome.
 */
export function DungeonCombatBody({
  dungeon,
  encounter,
  instance,
  campaignShortId,
  pcDetailById,
  pcShortIdById,
}: {
  dungeon: DungeonRow
  encounter: EncounterRow
  instance: MapInstanceRow
  campaignShortId: string
  pcDetailById: Record<string, PcCombatantDetail>
  pcShortIdById: Record<string, string>
}) {
  const {
    session,
    instance: instanceState,
    isPending,
    dispatch,
    endEncounter,
    pcVitalsVersions,
    onPcPing,
  } = useCombatConsole(encounter, instance, pcDetailById)

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(
    null
  )
  const [moveAnywhere, setMoveAnywhere] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const enemyStatblockById = useMemo(
    () => resolveCatalogEnemyStatblocks(session.combatants),
    [session.combatants]
  )
  const view = buildConsoleView(session, pcDetailById, enemyStatblockById)
  const { currentActor } = view
  const roster = buildRosterView(
    session,
    instanceState,
    pcDetailById,
    enemyStatblockById
  )
  // Memoized so the canvas's node-sync effect only re-derives on real spatial /
  // session change — not on a sibling state flip (drawer open, move-anywhere).
  const layout = useMemo(
    () =>
      resolveZoneLayout(
        session,
        instanceState,
        pcDetailById,
        enemyStatblockById
      ),
    [session, instanceState, pcDetailById, enemyStatblockById]
  )
  const canvasMode = useMemo(
    () => ({ kind: "combat" as const, layout }),
    [layout]
  )
  const selectedDetail =
    selectedCombatantId !== null
      ? combatantDetail(
          session,
          instanceState,
          selectedCombatantId,
          pcDetailById,
          enemyStatblockById
        )
      : null

  const phase: ConsolePhase =
    currentActor === null
      ? "drafting"
      : !currentActor.hasActed
        ? "active"
        : modalOpen
          ? "resolving"
          : "drafting"

  const actingCombatantId =
    phase === "active" ? (currentActor?.id ?? null) : null
  const actingZoneId =
    actingCombatantId !== null
      ? (instanceState.occupancy[actingCombatantId]?.zoneId ?? "")
      : ""
  const actingZone = instanceState.geometry.zones[actingZoneId]
  const allZoneIds = Object.keys(instanceState.geometry.zones)
  const movableZoneIds =
    actingCombatantId === null
      ? []
      : moveAnywhere || !actingZone
        ? allZoneIds.filter((id) => id !== actingZoneId)
        : adjacentZones(instanceState, actingZoneId).map((zone) => zone.id)

  const fallenPcNames = roster.players
    .filter((row) => row.isFallen)
    .map((row) => row.name)

  // Mechanic state lives on the character row — pass it through so the end-of-turn
  // review can surface a Berserker's Frenzy decrement reminder.
  const pcMechanicByCharacterId = Object.fromEntries(
    Object.values(pcDetailById).map((detail) => [
      detail.id,
      detail.activeMechanic,
    ])
  )
  const obligations =
    currentActor !== null
      ? endOfTurnObligations(session, currentActor.id, pcMechanicByCharacterId)
      : null

  // One realtime listener per PC combatant (UNN-373) — a player self-heal / DM
  // adjust elsewhere pushes the updated vitals into the rail + drawer.
  const pcChannelIds = session.combatants.flatMap((combatant) =>
    combatant.ref.kind === "pc" &&
    pcShortIdById[combatant.ref.characterId] !== undefined
      ? [
          {
            characterId: combatant.ref.characterId,
            shortId: pcShortIdById[combatant.ref.characterId]!,
          },
        ]
      : []
  )

  return (
    <SidebarProvider
      // The combatant rail (~20rem) overflows the default 16rem sidebar; widen it
      // so the PLAYERS/ENEMIES rows don't horizontally scroll.
      style={{ "--sidebar-width": "22rem" } as React.CSSProperties}
    >
      {pcChannelIds.map(({ characterId, shortId }) => (
        <RealtimeChannelListener
          key={shortId}
          domain="character"
          shortId={shortId}
          onPing={(data) => onPcPing(characterId, data)}
        />
      ))}

      <DungeonCombatSidebar
        roster={roster}
        dungeonName={dungeon.name}
        campaignShortId={campaignShortId}
        round={session.round}
        onSelectCombatant={setSelectedCombatantId}
      />

      <SidebarInset className="relative">
        <DungeonCombatCanvasProvider
          value={{
            round: session.round,
            phase,
            draftHeading: COMBAT_DRAFT_HEADINGS[view.draftingSide],
            actingName: currentActor?.name ?? null,
            turnRows: view.rows,
            roundComplete: view.roundComplete,
            onDraft: (combatantId) =>
              dispatch({ kind: "draftCombatant", combatantId }),
            onAdvanceRound: () => dispatch({ kind: "advanceRound" }),
            onEndTurn: () => {
              dispatch({ kind: "endTurn" })
              setModalOpen(true)
            },
            actingCombatantId,
            movableZoneIds,
            moveAnywhere,
            onToggleMoveAnywhere: () => setMoveAnywhere((prev) => !prev),
            onMoveActing: (toZoneId) => {
              if (actingCombatantId === null) return
              dispatch({
                kind: "moveCombatant",
                combatantId: actingCombatantId,
                toZoneId,
              })
            },
            onSelectCombatant: setSelectedCombatantId,
            onAddCombatant: () => setAddOpen(true),
            playerViewHref: `/c/dungeon/${dungeon.shortId}`,
            onEndEncounter: endEncounter,
            fallenPcNames,
            disabled: isPending,
          }}
        >
          <div className="absolute inset-0">
            <DungeonCanvas
              instance={instanceState}
              mode={canvasMode}
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
        onClose={() => setSelectedCombatantId(null)}
        onCombatEvent={dispatch}
        pcVitalsVersions={pcVitalsVersions}
      />

      <EndOfTurnModal
        actorId={currentActor?.id ?? ""}
        actorName={currentActor?.name ?? ""}
        obligations={obligations}
        open={modalOpen && phase === "resolving"}
        onCombatEvent={dispatch}
        isPending={isPending}
        onDone={() => setModalOpen(false)}
      />

      <DungeonAddCombatantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        zones={Object.values(instanceState.geometry.zones).map((zone) => ({
          id: zone.id,
          name: zone.name,
        }))}
        onAdd={(enemyKey, zoneId) =>
          dispatch({
            kind: "addCombatant",
            setup: {
              id: crypto.randomUUID(),
              side: "enemies",
              ref: { kind: "catalog-enemy", enemyKey },
              zoneId,
            },
          })
        }
      />
    </SidebarProvider>
  )
}
