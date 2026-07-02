"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { dungeonReminders } from "@workspace/game/engine"
import { SidebarInset } from "@workspace/ui/components/sidebar"
import { Spinner } from "@workspace/ui/components/spinner"

import { DungeonEditCanvas } from "@/components/dungeon/canvas/edit-canvas"
import { DungeonCanvasProvider } from "@/components/dungeon/canvas/explore/context"
import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { DungeonPartySidebar } from "@/components/dungeon/explore/party-sidebar"
import { useDungeonConsole } from "@/components/dungeon/explore/use-dungeon-console"
import { DungeonZoneSheet } from "@/components/dungeon/explore/zone-sheet"
import { DungeonSidebarSlot } from "@/components/dungeon/shell/console-shell"
import { parseCharacterPing } from "@/hooks/character-version-sync"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { DUNGEON_REMINDER_COPY } from "@/lib/ui/labels"

// React Flow measures the DOM, so the canvas renders client-only against a
// mounted container (the template editor lazy-loads MapCanvas the same way).
const DungeonCanvas = dynamic(
  () =>
    import("@/components/dungeon/canvas/canvas").then(
      (module) => module.DungeonCanvas
    ),
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
 * The run console's **Play (exploration)** phase, driven by
 * {@link useDungeonConsole} and rendered by the thin
 * {@link import("@/components/dungeon/run-console").DungeonRunConsole}. The Play
 * bar's "Start an encounter" affordance is disabled until dungeon combat returns
 * on engine v2 (PR11d).
 *
 * Renders inside the persistent {@link import("@/components/dungeon/shell/console-shell").DungeonConsoleShell}
 * (UNN-488): its sidebar (party rows) is portaled into the shell's shared
 * `<Sidebar>` via {@link DungeonSidebarSlot}, and it returns a Fragment so its
 * `<SidebarInset>` stays a direct DOM sibling of that `<Sidebar>` (the inset
 * margins read off it as a `peer`).
 */
export function DungeonExploreBody({
  dungeon,
  instance,
  roster,
  placedCharacters,
  campaignShortId,
}: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  roster: Record<string, DungeonRosterEntry>
  placedCharacters: CharacterSummary[]
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

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const selectedZone = selectedZoneId
    ? (instanceState.geometry.zones[selectedZoneId] ?? null)
    : null

  // Edit ⇄ Play is DM-local, ephemeral UI (never persisted), orthogonal to the
  // delve's status (ADR — Console topology). Play draws tokens/fog; Edit swaps in
  // the Map builder over the live Instance geometry.
  const [mode, setMode] = useState<"play" | "edit">("play")

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

  return (
    <>
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

      <DungeonSidebarSlot>
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
      </DungeonSidebarSlot>

      <SidebarInset className="relative">
        {mode === "play" ? (
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
              finishDelve,
              mode,
              onModeChange: setMode,
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
        ) : (
          <div className="absolute inset-0">
            <DungeonEditCanvas
              instance={instanceState}
              roster={roster}
              onGeometryEvent={(event) =>
                dispatch({ kind: "editGeometry", event })
              }
              mode={mode}
              onModeChange={setMode}
              persistKey={dungeon.shortId}
            />
          </div>
        )}
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
    </>
  )
}
