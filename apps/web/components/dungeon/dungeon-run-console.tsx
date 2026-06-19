"use client"

import dynamic from "next/dynamic"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { toast } from "sonner"

import {
  dungeonReminders,
  type InitiativeStats,
  type PcCombatantDetail,
} from "@workspace/game/engine"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { Spinner } from "@workspace/ui/components/spinner"

import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { DUNGEON_REMINDER_COPY } from "@/lib/ui/labels"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"
import { DungeonCanvasProvider } from "./canvas/dungeon-canvas-context"
import { DungeonCombatBody } from "./dungeon-combat-body"
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

/** The live encounter on this delve's Instance + its hydrated combat data — present
 *  only while a fight is running (the console's combat phase, UNN-467). */
export interface DungeonCombatData {
  encounter: EncounterRow
  pcDetailById: Record<string, PcCombatantDetail>
  pcShortIdById: Record<string, string>
}

/**
 * The **active** DM run console (UNN-464 / UNN-467): one surface with three phases
 * that morph the same React Flow canvas + left panel + bottom bar — **Play**
 * (exploration), **Setup** (the spatially-scoped combatant picker), and **Combat**
 * (the live fight on the same Instance). Combat is server-derived (a live encounter
 * on the delve's Instance); Setup is an ephemeral client phase entered from the
 * Play bar's "Start an encounter" and left by Cancel with no state change.
 *
 * Rendered **client-only** (after mount): a heavily-interactive, auth-gated DM
 * tool with no SEO value, and the React Flow canvas needs a measured DOM — so SSR
 * buys nothing and only risks a `useId` hydration mismatch.
 */
export function DungeonRunConsole(props: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  roster: Record<string, DungeonRosterEntry>
  placedCharacters: CharacterSummary[]
  pcStatsById: Record<string, InitiativeStats>
  campaignShortId: string
  combat: DungeonCombatData | null
}) {
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

  if (props.combat) {
    return (
      <DungeonCombatBody
        dungeon={props.dungeon}
        encounter={props.combat.encounter}
        instance={props.instance}
        campaignShortId={props.campaignShortId}
        pcDetailById={props.combat.pcDetailById}
        pcShortIdById={props.combat.pcShortIdById}
      />
    )
  }

  return <DungeonExplorationBody {...props} />
}

/**
 * The Play (exploration) phase + its Setup morph — the half of the console driven
 * by {@link useDungeonConsole}. Split out so the exploration optimistic hook only
 * mounts when no fight is live (hooks stay unconditional).
 */
function DungeonExplorationBody({
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
  } = useDungeonConsole(dungeon, instance)

  const [inSetup, setInSetup] = useState(false)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const selectedZone = selectedZoneId
    ? (instanceState.geometry.zones[selectedZoneId] ?? null)
    : null

  const moveToken = (characterId: string, toZoneId: string) =>
    dispatch({ kind: "moveCombatant", combatantId: characterId, toZoneId })

  const canvasMode = useMemo(
    () => ({ kind: "play" as const, roster }),
    [roster]
  )

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
            startEncounter: () => setInSetup(true),
            finishDelve,
            disabled: isPending,
          }}
        >
          <div className="absolute inset-0">
            <DungeonCanvas instance={instanceState} mode={canvasMode} />
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
