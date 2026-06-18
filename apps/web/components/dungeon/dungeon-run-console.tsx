"use client"

import dynamic from "next/dynamic"
import { useSyncExternalStore } from "react"

import { Spinner } from "@workspace/ui/components/spinner"

import { CampaignBackLink } from "@/components/combat/campaign-back-link"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"
import { TurnLoopRail } from "./turn-loop-rail"
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
 * The **active** DM run console (UNN-464): the React Flow play map (token
 * placement/movement + zone reveal) beside the turn-loop rail (counter, acted
 * flags, reminders, connection fog/locks, Finish delve). Drives everything through
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
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center p-6">
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
    setRandomEncountersEnabled,
    setRandomEncounterInterval,
  } = useDungeonConsole(dungeon, instance)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <header>
        <h1 className="font-heading text-lg font-medium">{dungeon.name}</h1>
        <p className="text-sm text-muted-foreground">Delve · running</p>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="h-[70vh] overflow-hidden rounded-lg border bg-muted/20 lg:flex-1">
          <DungeonCanvas
            instance={instanceState}
            roster={roster}
            onMoveToken={(characterId, toZoneId) =>
              dispatch({
                kind: "moveCombatant",
                combatantId: characterId,
                toZoneId,
              })
            }
            onRevealZone={(zoneId) => dispatch({ kind: "revealZone", zoneId })}
            onHideZone={(zoneId) => dispatch({ kind: "hideZone", zoneId })}
          />
        </div>

        <TurnLoopRail
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
          onSetRandomEncountersEnabled={setRandomEncountersEnabled}
          onSetRandomEncounterInterval={setRandomEncounterInterval}
          onFinishDelve={finishDelve}
        />
      </div>
    </main>
  )
}
