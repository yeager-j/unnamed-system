"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { dungeonReminders, type InitiativeStats } from "@workspace/game/engine"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { Spinner } from "@workspace/ui/components/spinner"

import { parseCharacterPing } from "@/hooks/character-version-sync"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { DUNGEON_REMINDER_COPY } from "@/lib/ui/labels"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"
import { DungeonCanvasProvider } from "./canvas/dungeon-canvas-context"
import { DungeonEncounterSetup } from "./dungeon-encounter-setup"
import { DungeonPartySidebar } from "./dungeon-party-sidebar"
import { DungeonZoneSheet } from "./dungeon-zone-sheet"
import { useDungeonConsole } from "./use-dungeon-console"

// React Flow measures the DOM, so the canvas renders client-only against a
// mounted container (the template editor lazy-loads MapCanvas the same way).
const DungeonCanvas = dynamic(
  () =>
    import("./canvas/dungeon-canvas").then((module) => module.DungeonCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    ),
  }
)

/**
 * The run console's **Play (exploration)** phase + its **Setup** morph — the
 * non-combat half of the console, driven by {@link useDungeonConsole}. The thin
 * {@link import("./dungeon-run-console").DungeonRunConsole} orchestrator forks here
 * vs the {@link import("./dungeon-combat-body").DungeonCombatBody} by mode, kept a
 * separate component (not one merged body) because exploration and combat own
 * **different** optimistic hooks — `useDungeonConsole` vs `useCombatConsole` — and
 * the rules of hooks forbid conditionally calling one or the other. Setup is an
 * ephemeral client phase entered from the Play bar's "Start an encounter" and left
 * by Cancel with no state change.
 */
export function DungeonExploreBody({
  dungeon,
  instance,
  roster,
  placedCharacters,
  pcStatsById,
  campaignShortId,
}: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  roster: Record<string, DungeonRosterEntry>
  placedCharacters: CharacterSummary[]
  pcStatsById: Record<string, InitiativeStats>
  campaignShortId: string
}) {
  const {
    dungeonState,
    instanceState,
    isPending,
    dispatch,
    searchReveal,
    finishDelve,
    scheduleRefresh,
  } = useDungeonConsole(dungeon, instance)

  const [inSetup, setInSetup] = useState(false)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const selectedZone = selectedZoneId
    ? (instanceState.geometry.zones[selectedZoneId] ?? null)
    : null

  const moveToken = (characterId: string, toZoneId: string) =>
    dispatch({ kind: "moveCombatant", combatantId: characterId, toZoneId })

  // React Compiler keeps this referentially stable across renders where `roster`
  // is unchanged, so the canvas's node-sync effect doesn't re-derive — no manual
  // memo (matching dungeon-combat-body).
  const canvasMode = { kind: "play" as const, roster }

  // Surface the turn-driven reminders as toasts — once per turn the counter
  // reaches a threshold. Persistent (top-right, clear of the bottom bar).
  const lastToastedTurn = useRef<number | null>(null)
  useEffect(() => {
    if (lastToastedTurn.current === dungeonState.turnCounter) return
    lastToastedTurn.current = dungeonState.turnCounter
    for (const reminder of dungeonReminders(dungeonState)) {
      const copy = DUNGEON_REMINDER_COPY[reminder.kind]
      toast.warning(copy.title, {
        description: copy.body,
        position: "top-right",
        duration: Infinity,
      })
    }
  }, [dungeonState])

  if (inSetup) {
    return (
      <DungeonEncounterSetup
        dungeon={dungeon}
        instance={instance}
        placedCharacters={placedCharacters}
        pcStatsById={pcStatsById}
        campaignShortId={campaignShortId}
        onCancel={() => setInSetup(false)}
      />
    )
  }

  return (
    <SidebarProvider>
      {placedCharacters.map((character) => (
        <RealtimeChannelListener
          key={character.shortId}
          domain="character"
          shortId={character.shortId}
          onPing={(data) => {
            if (parseCharacterPing(data)) scheduleRefresh()
          }}
        />
      ))}

      <DungeonPartySidebar
        roster={roster}
        instanceState={instanceState}
        dungeonState={dungeonState}
        dungeon={dungeon}
        campaignShortId={campaignShortId}
        disabled={isPending}
        onMarkActed={(characterId) =>
          dispatch({ kind: "markActed", characterId })
        }
        onMoveToken={moveToken}
      />

      <SidebarInset className="relative">
        <DungeonCanvasProvider
          value={{
            revealZone: (zoneId) => dispatch({ kind: "revealZone", zoneId }),
            hideZone: (zoneId) => dispatch({ kind: "hideZone", zoneId }),
            moveParty: (zoneId) => {
              for (const [characterId, token] of Object.entries(
                instanceState.occupancy
              )) {
                if (roster[characterId] === undefined) continue
                if (token.zoneId !== zoneId) {
                  moveToken(characterId, zoneId)
                }
              }
            },
            openDetails: setSelectedZoneId,
            turnCounter: dungeonState.turnCounter,
            advanceTurn: () => dispatch({ kind: "advanceTurn" }),
            startEncounter: () => setInSetup(true),
            finishDelve,
            disabled: isPending,
          }}
        >
          <div className="absolute inset-0">
            <DungeonCanvas
              instance={instanceState}
              mode={canvasMode}
              persistKey={dungeon.shortId}
            />
          </div>
        </DungeonCanvasProvider>
      </SidebarInset>

      <DungeonZoneSheet
        zone={selectedZone}
        instance={instanceState}
        roster={roster}
        disabled={isPending}
        onClose={() => setSelectedZoneId(null)}
        onRevealZone={(zoneId) => dispatch({ kind: "revealZone", zoneId })}
        onHideZone={(zoneId) => dispatch({ kind: "hideZone", zoneId })}
        onRevealConnection={(connectionId) =>
          dispatch({ kind: "revealConnection", connectionId })
        }
        onSearchReveal={(characterId, connectionId) =>
          searchReveal(characterId, {
            kind: "revealConnection",
            connectionId,
          })
        }
        onHideConnection={(connectionId) =>
          dispatch({ kind: "hideConnection", connectionId })
        }
        onUnlockConnection={(connectionId) =>
          dispatch({ kind: "unlockConnection", connectionId })
        }
        onLockConnection={(connectionId) =>
          dispatch({ kind: "lockConnection", connectionId })
        }
      />
    </SidebarProvider>
  )
}
