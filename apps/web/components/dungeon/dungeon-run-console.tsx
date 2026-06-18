"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { dungeonReminders } from "@workspace/game/engine"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { Spinner } from "@workspace/ui/components/spinner"

import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { DUNGEON_REMINDER_COPY } from "@/lib/ui/labels"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"
import { DungeonCanvasProvider } from "./canvas/dungeon-canvas-context"
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
 * The **active** DM run console (UNN-464): a full-bleed React Flow play map (token
 * placement/movement + zone reveal) with the turn-loop rail pinned to the left
 * (counter, acted flags, reminders, Finish delve) and a click-to-open Zone details
 * sheet sliding over the right edge. Drives everything through
 * {@link useDungeonConsole} — dual-optimistic over the dungeon + Instance rows, so
 * every move/reveal/turn-loop edit feels instant and reconciles on refresh.
 *
 * Rendered **client-only** (after mount): a heavily-interactive, auth-gated DM
 * tool with no SEO value, and the React Flow canvas needs a measured DOM — so SSR
 * buys nothing and only risks a `useId` hydration mismatch as the lazy canvas
 * shifts the tree. The pre-mount skeleton uses no `useId` components.
 */
export function DungeonRunConsole(props: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  roster: Record<string, DungeonRosterEntry>
  campaignShortId: string
}) {
  // Client-only render flag without setState-in-effect: `false` on the server,
  // `true` once hydrated (the repo's idiom for "am I on the client").
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  if (!mounted) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </main>
    )
  }
  return <DungeonRunConsoleBody {...props} />
}

function DungeonRunConsoleBody({
  dungeon,
  instance,
  roster,
  campaignShortId,
}: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  roster: Record<string, DungeonRosterEntry>
  campaignShortId: string
}) {
  const {
    dungeonState,
    instanceState,
    isPending,
    dispatch,
    searchReveal,
    finishDelve,
  } = useDungeonConsole(dungeon, instance)

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const selectedZone = selectedZoneId
    ? (instanceState.geometry.zones[selectedZoneId] ?? null)
    : null

  const moveToken = (characterId: string, toZoneId: string) =>
    dispatch({ kind: "moveCombatant", combatantId: characterId, toZoneId })

  // Surface the turn-driven reminders as toasts (their new home, replacing the
  // floating Alert list) — once per turn the counter reaches a threshold. Pinned
  // top-right (clear of the bottom turn bar) and persistent until the DM dismisses
  // them, so a nudge can't auto-vanish before it's seen.
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
    <SidebarProvider>
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
                if (token.zoneId !== zoneId) {
                  moveToken(characterId, zoneId)
                }
              }
            },
            openDetails: setSelectedZoneId,
            turnCounter: dungeonState.turnCounter,
            advanceTurn: () => dispatch({ kind: "advanceTurn" }),
            finishDelve,
            disabled: isPending,
          }}
        >
          <div className="absolute inset-0">
            <DungeonCanvas instance={instanceState} roster={roster} />
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
