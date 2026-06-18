"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import {
  type DungeonEvent,
  type MapInstanceEvent,
  type RandomEncounterInterval,
} from "@workspace/game/foundation"

import { useQueuedWrite } from "@/hooks/use-queued-write"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import {
  setRandomEncounterIntervalAction,
  setRandomEncountersEnabledAction,
} from "@/lib/actions/dungeon/reminders"
import { searchRevealAction } from "@/lib/actions/dungeon/search-reveal"
import { setDungeonStatusAction } from "@/lib/actions/dungeon/status"
import { getDungeonVersionAction } from "@/lib/actions/dungeon/version"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import {
  dispatchDungeonEvent,
  reduceDungeonInstanceOptimistic,
  reduceDungeonOptimistic,
} from "./dispatch-dungeon-event"

/**
 * The live DM dungeon console's owner-mode write surface (UNN-464) — the
 * exploration peer of `useCombatConsole`. It mirrors the server's reducers
 * optimistically across **two** containers (`dungeon` via `reduceDungeon`,
 * `instance` via {@link reduceMapInstance}) and **two** {@link useQueuedWrite}
 * version tokens (one per row), so the frame the DM sees matches what
 * `applyDungeonEvent` will persist; on success it `router.refresh()`es to
 * reconcile. {@link dispatchDungeonEvent} routes each event to the right
 * container + queue.
 *
 * Two gestures sit **outside** the optimistic dispatch path because they aren't
 * `reduceDungeon` events:
 * - {@link searchReveal} — the search-that-reveals cross-write (`markActed` +
 *   reveal), one `guardMany`; it mirrors **both** containers and advances both
 *   refs (the action returns both bumped versions).
 * - {@link finishDelve} — the terminal `active → done` status flip (a row column,
 *   like combat's `endEncounter`), enqueued on the dungeon queue.
 *
 * No realtime: the `dungeon:` channel is M3 (UNN-468), so the console relies on
 * its own optimistic frame + `router.refresh()`; the player fog view polls.
 */
export function useDungeonConsole(
  dungeon: Pick<DungeonRow, "id" | "shortId" | "state" | "version">,
  instance: Pick<MapInstanceRow, "state" | "version">
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [dungeonState, applyDungeonOptimistic] = useOptimistic(
    dungeon.state,
    reduceDungeonOptimistic
  )
  const [instanceState, applyInstanceOptimistic] = useOptimistic(
    instance.state,
    reduceDungeonInstanceOptimistic
  )

  const dungeonWrite = useQueuedWrite({
    serverVersion: dungeon.version,
    refetchVersion: async () => {
      const result = await getDungeonVersionAction({ shortId: dungeon.shortId })
      return result.ok ? result.value.version : null
    },
  })
  const instanceWrite = useQueuedWrite({ serverVersion: instance.version })

  function dispatch(event: DungeonEvent | MapInstanceEvent) {
    startTransition(async () => {
      const result = await dispatchDungeonEvent({
        event,
        dungeonId: dungeon.id,
        applyDungeonOptimistic,
        applyInstanceOptimistic,
        dungeonWrite,
        instanceWrite,
      })
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  function searchReveal(characterId: string, event: MapInstanceEvent) {
    startTransition(async () => {
      applyDungeonOptimistic({ kind: "markActed", characterId })
      applyInstanceOptimistic(event)
      const result = await dungeonWrite.enqueue((expectedVersion) =>
        searchRevealAction({
          dungeonId: dungeon.id,
          expectedVersion,
          expectedInstanceVersion: instanceWrite.versionRef.current,
          characterId,
          event,
        })
      )
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      instanceWrite.versionRef.current = result.value.instanceVersion
      router.refresh()
    })
  }

  function finishDelve() {
    startTransition(async () => {
      const result = await dungeonWrite.enqueue((expectedVersion) =>
        setDungeonStatusAction({
          dungeonId: dungeon.id,
          status: "done",
          expectedVersion,
        })
      )
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  /** The per-field reminder-setting writes (UNN-226): not `reduceDungeon` events,
   *  so they enqueue their own action on the dungeon queue and reconcile by
   *  refresh (a settings toggle needs no instant optimistic frame). */
  function setRandomEncountersEnabled(enabled: boolean) {
    startTransition(async () => {
      const result = await dungeonWrite.enqueue((expectedVersion) =>
        setRandomEncountersEnabledAction({
          dungeonId: dungeon.id,
          enabled,
          expectedVersion,
        })
      )
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  function setRandomEncounterInterval(intervalTurns: RandomEncounterInterval) {
    startTransition(async () => {
      const result = await dungeonWrite.enqueue((expectedVersion) =>
        setRandomEncounterIntervalAction({
          dungeonId: dungeon.id,
          intervalTurns,
          expectedVersion,
        })
      )
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return {
    dungeonState,
    instanceState,
    isPending,
    dispatch,
    searchReveal,
    finishDelve,
    setRandomEncountersEnabled,
    setRandomEncounterInterval,
  }
}
