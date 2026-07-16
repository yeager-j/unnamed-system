"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { dungeonReminders } from "@workspace/game-v2/spatial"
import { SidebarInset } from "@workspace/ui/components/sidebar"
import { Spinner } from "@workspace/ui/components/spinner"

import { tokensByZone } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/build-nodes"
import { DungeonEditCanvas } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/edit-canvas"
import { DungeonCanvasProvider } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/context"
import { RosterInspector } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/roster-inspector"
import type { DungeonRosterEntry } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import { DungeonPartySidebar } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/party-sidebar"
import { useDungeonConsole } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/use-dungeon-console"
import { DungeonZoneSheet } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/zone-sheet"
import { DungeonSidebarSlot } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell"
import { exploreZoneView } from "@/domain/dungeon/view/set-piece-view"
import { DUNGEON_REMINDER_COPY } from "@/domain/labels"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { dungeonSetupPath } from "@/lib/paths"
import { parseCharacterPing } from "@/lib/sync/character-version-sync"
import { RealtimeChannelListener } from "@/lib/sync/use-realtime-channel"

// React Flow measures the DOM, so the canvas renders client-only against a
// mounted container (the template editor lazy-loads MapCanvas the same way).
const DungeonCanvas = dynamic(
  () =>
    import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").then(
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
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/run-console").DungeonRunConsole}. The Play
 * bar's "Start an encounter" affordance navigates to the pre-combat staging
 * surface ({@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/encounter-staging").DungeonEncounterStaging},
 * UNN-536/UNN-541).
 *
 * Renders inside the persistent {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell").DungeonConsoleShell}
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
  const router = useRouter()
  const {
    dungeonState,
    instanceState,
    isPending,
    dispatch,
    placeToken,
    searchReveal,
    finishDelve,
    scheduleRefresh,
  } = useDungeonConsole(dungeon, instance)

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const selectedZone = selectedZoneId
    ? (instanceState.geometry.zones[selectedZoneId] ?? null)
    : null

  // The roster inspector's target — a distinct piece of state from the details
  // sheet (`selectedZoneId`) and independent of the camera (§D7). The two panels
  // share the right rail, so opening either closes the other.
  const [inspectId, setInspectId] = useState<string | null>(null)
  const tokensPerZone = tokensByZone(instanceState, roster)
  const inspectZone = (zoneId: string | null) => {
    setInspectId(zoneId)
    if (zoneId !== null) setSelectedZoneId(null)
  }
  const openDetails = (zoneId: string) => {
    setSelectedZoneId(zoneId)
    setInspectId(null)
  }
  const inspectedZone = inspectId
    ? (instanceState.geometry.zones[inspectId] ?? null)
    : null
  const inspectedView = inspectedZone
    ? exploreZoneView({
        zone: inspectedZone,
        revealed: instanceState.reveal.revealedZoneIds.includes(
          inspectedZone.id
        ),
        tokens: tokensPerZone[inspectedZone.id] ?? [],
      })
    : null

  // Edit ⇄ Play is DM-local, ephemeral UI (never persisted), orthogonal to the
  // delve's status (ADR — Console topology). Play draws tokens/fog; Edit swaps in
  // the Map builder over the live Instance geometry.
  const [mode, setMode] = useState<"play" | "edit">("play")

  const moveToken = (characterId: string, toZoneId: string) =>
    dispatch({ kind: "moveCombatant", tokenKey: characterId, toZoneId })

  // Campaign characters not yet on the board — the DM can bring them into the
  // running delve (UNN-487) via useDungeonConsole's `placeToken` (place, then
  // reveal-if-real gated on the placement succeeding). Derived from live
  // occupancy, so a just-placed character drops out of the list on the next
  // render.
  const absentCharacters = placedCharacters.filter(
    (character) => instanceState.occupancy[character.id] === undefined
  )

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
            if (parseCharacterPing(data, "any")) scheduleRefresh()
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
          absentCharacters={absentCharacters}
          disabled={isPending}
          onMarkActed={(characterId) =>
            dispatch({ kind: "markActed", characterId })
          }
          onMoveToken={moveToken}
          onPlaceToken={placeToken}
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
              openDetails,
              onInspect: inspectZone,
              turnCounter: dungeonState.turnCounter,
              advanceTurn: () => dispatch({ kind: "advanceTurn" }),
              finishDelve,
              onStartEncounter: () =>
                router.push(dungeonSetupPath(campaignShortId, dungeon.shortId)),
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
                onZoneClick={(zoneId) =>
                  inspectZone(
                    (tokensPerZone[zoneId]?.length ?? 0) > 0 ? zoneId : null
                  )
                }
                onPaneClick={() => setInspectId(null)}
                overlay={
                  <RosterInspector
                    view={inspectedView}
                    onClose={() => setInspectId(null)}
                  />
                }
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
