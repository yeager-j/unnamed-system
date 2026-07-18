"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  type DungeonEvent,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import { type Result } from "@workspace/result"

import { dispatchDungeonEvent } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/dispatch-event"
import {
  reduceDungeonConsoleOptimistic,
  type DungeonConsoleAction,
  type DungeonConsoleState,
} from "@/domain/dungeon/console-optimistic"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { finishExpeditionAction } from "@/lib/actions/dungeon/expedition-finish"
import { searchRevealAction } from "@/lib/actions/dungeon/search-reveal"
import { setDungeonStatusAction } from "@/lib/actions/dungeon/status"
import { getDungeonVersionAction } from "@/lib/actions/dungeon/version"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { fetchDungeonInstanceVersion } from "@/lib/sync/fetch-dungeon-instance-version"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
import { runDualVersionedWrite } from "@/lib/sync/run-dual-versioned-write"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"

/**
 * The live DM dungeon console's owner-mode write surface (UNN-464) — the
 * exploration peer of `useCombatConsole`. It mirrors the server's reducers
 * optimistically into **one** container over `{ dungeon, instance }`
 * ({@link reduceDungeonConsoleOptimistic}, UNN-597 — the same single-container
 * shape UNN-535 gave the combat console) while keeping **two**
 * {@link useQueuedWrite} version tokens (the two rows still version
 * independently), so the frame the DM sees matches what `applyDungeonEvent`
 * will persist; on success it `router.refresh()`es to reconcile.
 * {@link dispatchDungeonEvent} routes each event to the right container arm +
 * queue.
 *
 * Two gestures sit **outside** the optimistic dispatch path because they aren't
 * `reduceDungeon` events:
 * - {@link searchReveal} — the search-that-reveals cross-write (`markActed` +
 *   reveal), one `guardMany`; it mirrors **both** containers and rides the
 *   **combined spine** (UNN-589 D11): acquire the dungeon lane and, inside it,
 *   the instance lane, then run the two-token protocol
 *   ({@link runDualVersionedWrite} — dual dispatch, dual fold, refetch-both
 *   stale retry). Same lock order as the server's transactions, which is what
 *   keeps a two-row write from interleaving with a single-row write on either
 *   lane.
 * - {@link finishDelve} — the terminal `active → done` flip. An ordinary delve
 *   enqueues the status flip on the dungeon lane alone; a Region **expedition**
 *   routes to `finishExpeditionAction` on the combined spine (its instance
 *   token is the D5 freeze, and the returned instance version must fold).
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
  instance: Pick<MapInstanceRow, "state" | "version">
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
  const instanceState = state.instance

  // Named refetchers: each lane's one-shot stale-retry reads through its own,
  // and the combined spine's refetch-both stale retry reuses the same pair.
  const refetchDungeonVersion = async () => {
    const result = await getDungeonVersionAction({ shortId: dungeon.shortId })
    return result.ok ? result.value.version : null
  }
  const refetchInstanceVersion = () =>
    fetchDungeonInstanceVersion(dungeon.shortId)

  const dungeonWrite = useQueuedWrite({
    serverVersion: dungeon.version,
    refetchVersion: refetchDungeonVersion,
  })
  const instanceWrite = useQueuedWrite({
    serverVersion: instance.version,
    refetchVersion: refetchInstanceVersion,
  })

  /**
   * The **combined spine** (UNN-589 D11) for two-row gestures: acquire the
   * dungeon lane, and *inside it* the instance lane, then run one two-token
   * protocol pass. Single-row writes acquire only their own lane, and every
   * cross-row gesture acquires dungeon-first, so neither lane can interleave a
   * single-row write into the middle of a two-row one — the client mirror of
   * the server's dungeon → mapInstance lock order.
   */
  const enqueueCrossRow = <
    TSuccess extends { version: number; instanceVersion: number },
    TError,
  >(
    action: (
      expectedVersion: number,
      expectedInstanceVersion: number
    ) => Promise<Result<TSuccess, TError>>
  ): Promise<Result<TSuccess, TError>> =>
    dungeonWrite.enqueueStep(() =>
      instanceWrite.enqueueStep(() =>
        runDualVersionedWrite(
          dungeonWrite.token,
          instanceWrite.token,
          refetchDungeonVersion,
          refetchInstanceVersion,
          action
        )
      )
    )

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

  function dispatch(event: DungeonEvent | MapInstanceEvent) {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await dispatchDungeonEvent({
            event,
            dungeonId: dungeon.id,
            applyOptimistic,
            dungeonWrite,
            instanceWrite,
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
          const placed = await dispatchDungeonEvent({
            event: { kind: "placeCombatant", tokenKey: characterId, zoneId },
            dungeonId: dungeon.id,
            applyOptimistic,
            dungeonWrite,
            instanceWrite,
          })
          if (!placed.ok) {
            toast.error(dungeonErrorMessage(placed.error))
            return
          }
          if (needsReveal) {
            const revealed = await dispatchDungeonEvent({
              event: { kind: "revealZone", zoneId },
              dungeonId: dungeon.id,
              applyOptimistic,
              dungeonWrite,
              instanceWrite,
            })
            // The placement already persisted; a failed reveal just leaves the
            // Zone hidden (the DM can reveal it manually), so fall through to
            // the refresh rather than returning without reconciling.
            if (!revealed.ok) toast.error(dungeonErrorMessage(revealed.error))
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
          applyOptimistic({
            kind: "dungeonEvent",
            event: { kind: "markActed", characterId },
          })
          applyOptimistic({ kind: "instanceEvent", event })
          const result = await enqueueCrossRow(
            (expectedVersion, expectedInstanceVersion) =>
              searchRevealAction({
                dungeonId: dungeon.id,
                expectedVersion,
                expectedInstanceVersion,
                characterId,
                event,
              })
          )
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

  function finishDelve() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          // A Region expedition's finish is not a bare flip: it folds the
          // Region's chart and freezes the Instance (both rows' tokens ride
          // the wire), so it takes the combined spine; an ordinary delve
          // stays a dungeon-lane status flip.
          const result =
            dungeon.regionId !== null
              ? await enqueueCrossRow(
                  (expectedVersion, expectedInstanceVersion) =>
                    finishExpeditionAction({
                      dungeonId: dungeon.id,
                      expectedVersion,
                      expectedInstanceVersion,
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
