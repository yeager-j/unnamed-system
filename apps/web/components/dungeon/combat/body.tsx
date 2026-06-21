"use client"

import { useState } from "react"

import {
  movableZonesForCombatant,
  type PcCombatantDetail,
} from "@workspace/game/engine"
import { SidebarInset } from "@workspace/ui/components/sidebar"

import { useCombatConsole } from "@/components/combat/console/use-combat-console"
import { EndOfTurnModal } from "@/components/combat/dialogs/end-of-turn-modal"
import { CombatantDrawer } from "@/components/combat/drawer/combatant-drawer"
import { DungeonCanvas } from "@/components/dungeon/canvas/canvas"
import { DungeonCombatCanvasProvider } from "@/components/dungeon/canvas/combat/context"
import { CombatSpinePanel } from "@/components/dungeon/canvas/combat/spine-panel"
import { CombatTurnBar } from "@/components/dungeon/canvas/combat/turn-bar"
import { DungeonAddCombatantDialog } from "@/components/dungeon/combat/add-combatant-dialog"
import { DungeonCombatSidebar } from "@/components/dungeon/combat/sidebar"
import { DungeonSidebarSlot } from "@/components/dungeon/shell/console-shell"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { COMBAT_DRAFT_HEADINGS } from "@/lib/ui/labels"

/**
 * The run console's **combat phase** (UNN-467) — a morph of the same shell that
 * drives exploration, layered over the **same** Map Instance the delve uses. The
 * left panel becomes the {@link DungeonCombatSidebar} (combatant rail), the canvas
 * renders the battlefield (combat tokens, the acting badge, Engaged zones, and
 * click-to-move for the acting combatant), and the bottom + top Panels drive the
 * side-alternating draft turn loop. It reuses the standalone console's engine
 * wholesale — {@link useCombatConsole} owns the dual-optimistic write path **and**
 * the shared view derivation (turn order / roster / zone layout / phase / selection
 * / obligations), and the {@link CombatantDrawer} / {@link EndOfTurnModal} render
 * unchanged — so the only new surface here is the canvas chrome + move-anywhere.
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
    view,
    currentActor,
    roster,
    layout,
    fallenPcNames,
    obligations,
    phase,
    pcChannelIds,
    selectedDetail,
    selectCombatant,
    endOfTurnOpen,
    closeEndOfTurn,
    onEndTurn,
    onDraft,
    onAdvanceRound,
  } = useCombatConsole(encounter, instance, pcDetailById, pcShortIdById)

  const [moveAnywhere, setMoveAnywhere] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // React Compiler keeps `layout` (and this object over it) referentially stable
  // across sibling state flips, so the canvas's node-sync effect only re-derives
  // on a real spatial/session change.
  const canvasMode = { kind: "combat" as const, layout }

  const actingCombatantId =
    phase === "active" ? (currentActor?.id ?? null) : null
  const movableZoneIds =
    actingCombatantId === null
      ? []
      : movableZonesForCombatant(instanceState, actingCombatantId, {
          anywhere: moveAnywhere,
        })

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
                combatantId: actingCombatantId,
                toZoneId,
              })
            },
            onSelectCombatant: selectCombatant,
            onCombatEvent: dispatch,
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
        pcVitalsVersions={pcVitalsVersions}
      />

      <EndOfTurnModal
        actorId={currentActor?.id ?? ""}
        actorName={currentActor?.name ?? ""}
        obligations={obligations}
        open={endOfTurnOpen}
        onCombatEvent={dispatch}
        isPending={isPending}
        onDone={closeEndOfTurn}
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
    </>
  )
}
