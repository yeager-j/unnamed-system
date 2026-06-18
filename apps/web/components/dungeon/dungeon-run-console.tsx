"use client"

import dynamic from "next/dynamic"
import { useState, useSyncExternalStore } from "react"

import { Spinner } from "@workspace/ui/components/spinner"

import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"
import { DungeonStatusPanel } from "./dungeon-status-panel"
import { DungeonZoneSheet } from "./dungeon-zone-sheet"
import { TurnLoopBar } from "./turn-loop-bar"
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

  return (
    <main className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <DungeonCanvas
          instance={instanceState}
          roster={roster}
          onRevealZone={(zoneId) => dispatch({ kind: "revealZone", zoneId })}
          onHideZone={(zoneId) => dispatch({ kind: "hideZone", zoneId })}
          onMoveParty={(zoneId) => {
            for (const [characterId, token] of Object.entries(
              instanceState.occupancy
            )) {
              if (token.zoneId !== zoneId) {
                dispatch({
                  kind: "moveCombatant",
                  combatantId: characterId,
                  toZoneId: zoneId,
                })
              }
            }
          }}
          onSelectZone={setSelectedZoneId}
        />
      </div>

      <DungeonStatusPanel
        name={dungeon.name}
        campaignShortId={campaignShortId}
        dungeonState={dungeonState}
      />

      <TurnLoopBar
        dungeonState={dungeonState}
        instanceState={instanceState}
        roster={roster}
        disabled={isPending}
        onAdvanceTurn={() => dispatch({ kind: "advanceTurn" })}
        onMarkActed={(characterId) =>
          dispatch({ kind: "markActed", characterId })
        }
        onMoveToken={(characterId, toZoneId) =>
          dispatch({
            kind: "moveCombatant",
            combatantId: characterId,
            toZoneId,
          })
        }
        onFinishDelve={finishDelve}
      />

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
    </main>
  )
}
