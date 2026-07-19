"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  type DungeonEvent,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"

import { dispatchDungeonEvent } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/dispatch-event"
import {
  reduceDungeonConsoleOptimistic,
  type DungeonConsoleAction,
  type DungeonConsoleState,
} from "@/domain/dungeon/console-optimistic"
import { isMapInstanceReplicaEvent } from "@/domain/map/replica/mutations"
import { useMapInstanceReplica } from "@/domain/map/replica/use-map-instance-replica"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { isDungeonEvent } from "@/lib/actions/dungeon/events.schema"
import { finishExpeditionAction } from "@/lib/actions/dungeon/expedition-finish"
import { searchRevealAction } from "@/lib/actions/dungeon/search-reveal"
import { setDungeonStatusAction } from "@/lib/actions/dungeon/status"
import { getDungeonVersionAction } from "@/lib/actions/dungeon/version"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import { parseVersionPing } from "@/lib/sync/version-ping"

/**
 * The live DM dungeon console's owner-mode write surface (UNN-464) — the
 * exploration peer of `useCombatConsole`. It mirrors the server's reducers
 * optimistically into **one** container over `{ dungeon, instance }`
 * ({@link reduceDungeonConsoleOptimistic}, UNN-597 — the same single-container
 * shape UNN-535 gave the combat console). Dungeon events retain their queued
 * version token; spatial intent is owned by the Map Instance Replica.
 *
 * Two gestures sit **outside** the optimistic dispatch path because they aren't
 * `reduceDungeon` events:
 * - {@link searchReveal} — the search-that-reveals cross-write (`markActed` +
 *   reveal), one `guardMany`; it mirrors **both** containers and rides the
 *   dungeon queue. The server transaction locks the current Map Instance and
 *   settles the reveal against it.
 * - {@link finishDelve} — the terminal `active → done` flip. An ordinary delve
 *   enqueues the status flip on the dungeon lane alone; a Region **expedition**
 *   routes to `finishExpeditionAction`, whose transaction owns the D5 freeze.
 *
 * The `dungeon:` channel (DM-to-DM spatial sync) is M3 (UNN-468), so the console
 * relies on its own optimistic frame + `router.refresh()` for the DM's own edits;
 * the player fog view polls. It does, however, expose {@link scheduleRefresh} so the
 * explore body can subscribe to each placed PC's **character** channel and refresh
 * the party panel when a player edits their own sheet (name/portrait now, HP/SP once
 * exploration hydrates full sheets) — the exploration peer of the combat console's
 * per-PC listeners. The DM never writes PC character rows here, so any character ping
 * is a remote change with no self-echo to suppress.
 */
export function useDungeonConsole(
  dungeon: Pick<
    DungeonRow,
    "id" | "shortId" | "state" | "version" | "regionId"
  >,
  instance: Pick<MapInstanceRow, "id" | "state" | "status" | "version">
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [state, applyOptimistic] = useOptimistic<
    DungeonConsoleState,
    DungeonConsoleAction
  >(
    { dungeon: dungeon.state, instance: instance.state },
    reduceDungeonConsoleOptimistic
  )
  const dungeonState = state.dungeon
  const mapReplica = useMapInstanceReplica({
    mapInstanceId: instance.id,
    initial: { state: instance.state, status: instance.status },
  })
  const instanceState = mapReplica.state

  // The dungeon lane retains one-shot stale retry. Map rebasing belongs to the
  // Replica transport.
  const refetchDungeonVersion = async () => {
    const result = await getDungeonVersionAction({ shortId: dungeon.shortId })
    return result.ok ? result.value.version : null
  }
  const dungeonWrite = useQueuedWrite({
    serverVersion: dungeon.version,
    refetchVersion: refetchDungeonVersion,
  })
  // Character-channel pings (a player editing their own sheet) collapse into one
  // `router.refresh()` per event-loop task — mirroring the combat console, so a
  // burst of pings doesn't fan out into a refresh per ping.
  const refreshScheduled = useRef(false)
  function scheduleRefresh() {
    if (refreshScheduled.current) return
    refreshScheduled.current = true
    queueMicrotask(() => {
      refreshScheduled.current = false
      router.refresh()
    })
  }

  useRealtimeChannel({
    domain: "dungeon",
    shortId: dungeon.shortId,
    onPing: (data) => {
      const ping = parseVersionPing(data, "dungeon")
      if (!ping) return
      if (ping.kind === "mapInstance") {
        mapReplica.notify()
        return
      }
      if (ping.version > dungeonWrite.versionRef.current) scheduleRefresh()
    },
    onReconnect: () => {
      mapReplica.notify()
      scheduleRefresh()
    },
  })

  function dispatch(event: DungeonEvent | MapInstanceEvent) {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          if (isMapInstanceReplicaEvent(event)) {
            const result = await mapReplica.mutate(event).remote
            if (!result.ok) {
              toast.error("Couldn't update the map. Try again.")
            }
            return
          }
          if (!isDungeonEvent(event)) {
            toast.error(dungeonErrorMessage("generation-event-not-supported"))
            return
          }
          const result = await dispatchDungeonEvent({
            event,
            dungeonId: dungeon.id,
            applyOptimistic,
            dungeonWrite,
          })
          if (!result.ok) {
            toast.error(dungeonErrorMessage(result.error))
            return
          }
          router.refresh()
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  /**
   * Bring a campaign character into the running delve (UNN-487): place their
   * token, then — for a joining PC, unlike the reducer's silent enemy-staging
   * placement — reveal the destination Zone. The reveal is a **second** spatial
   * write, so it is gated on the placement succeeding: if `placeCombatant` is
   * rejected (e.g. stale RSC data — the character was unplaced/deleted after the
   * dialog rendered, so the server returns `character-not-in-campaign`), the
   * reveal never fires and a hidden Zone can't leak to the watch with no PC
   * behind it. A Zone that is already revealed (the common "drop the joiner where
   * the party is" case) or non-existent skips the reveal, avoiding a redundant
   * write.
   */
  function placeToken(characterId: string, zoneId: string) {
    const needsReveal =
      instanceState.geometry.zones[zoneId] !== undefined &&
      !instanceState.reveal.revealedZoneIds.includes(zoneId)

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const placement = await mapReplica.mutate({
            kind: "placeCombatant",
            tokenKey: characterId,
            zoneId,
          }).remote
          if (!placement.ok) {
            toast.error("Couldn't place that character. Try again.")
            return
          }
          if (needsReveal) {
            const revealed = await mapReplica.mutate({
              kind: "revealZone",
              zoneId,
            }).remote
            // The placement already persisted; a failed reveal just leaves the
            // Zone hidden (the DM can reveal it manually), so fall through to
            // the refresh rather than returning without reconciling.
            if (!revealed.ok) {
              toast.error(
                "The character was placed, but the zone stayed hidden."
              )
            }
          }
          router.refresh()
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  function searchReveal(characterId: string, event: MapInstanceEvent) {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const settled = await mapReplica.settle()
          if (!settled.ok) {
            toast.error("Couldn't finish saving the map. Try again.")
            return
          }
          applyOptimistic({
            kind: "dungeonEvent",
            event: { kind: "markActed", characterId },
          })
          const result = await dungeonWrite.enqueue((expectedVersion) =>
            searchRevealAction({
              dungeonId: dungeon.id,
              expectedVersion,
              characterId,
              event,
            })
          )
          if (!result.ok) {
            toast.error(dungeonErrorMessage(result.error))
            return
          }
          mapReplica.notify()
          router.refresh()
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  function finishDelve() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const settled = await mapReplica.settle()
          if (!settled.ok) {
            toast.error("Couldn't finish saving the map. Try again.")
            return
          }
          // A Region expedition's finish is not a bare flip: it folds the
          // Region's chart and freezes the Instance. Both variants enqueue on
          // the dungeon lane; the server owns the Map Instance lock.
          const result =
            dungeon.regionId !== null
              ? await dungeonWrite.enqueue((expectedVersion) =>
                  finishExpeditionAction({
                    dungeonId: dungeon.id,
                    expectedVersion,
                  })
                )
              : await dungeonWrite.enqueue((expectedVersion) =>
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
          mapReplica.notify()
          router.refresh()
        },
        () => toast.error("Couldn't save. Try again.")
      )
    )
  }

  return {
    dungeonState,
    instanceState,
    isPending,
    dispatch,
    placeToken,
    searchReveal,
    finishDelve,
    scheduleRefresh,
  }
}
