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
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/dungeon-console-optimistic"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { searchRevealAction } from "@/lib/actions/dungeon/search-reveal"
import { setDungeonStatusAction } from "@/lib/actions/dungeon/status"
import { getDungeonVersionAction } from "@/lib/actions/dungeon/version"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"
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
 *   reveal), one `guardMany`; it mirrors **both** containers and advances both
 *   refs (the action returns both bumped versions).
 * - {@link finishDelve} — the terminal `active → done` status flip (a row column,
 *   like combat's `endEncounter`), enqueued on the dungeon queue.
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
  dungeon: Pick<DungeonRow, "id" | "shortId" | "state" | "version">,
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

  const dungeonWrite = useQueuedWrite({
    serverVersion: dungeon.version,
    refetchVersion: async () => {
      const result = await getDungeonVersionAction({ shortId: dungeon.shortId })
      return result.ok ? result.value.version : null
    },
  })
  // No `refetchVersion` for the Instance: there's no instance-version read
  // action yet (`getDungeonVersionAction` returns only the dungeon version), and
  // in M2 the DM is the sole writer so a stale spatial write is rare — it surfaces
  // an error toast rather than one-shot-retrying. Wire an instance-version refetch
  // here when realtime / multi-tab lands (M3, UNN-468).
  const instanceWrite = useQueuedWrite({ serverVersion: instance.version })

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
          // This is a cross-write (marks the dungeon row + reveals on the
          // Instance), but `dungeonWrite`'s one-shot stale-retry only refetches
          // the *dungeon* version — `expectedInstanceVersion` rides the
          // un-refetched Instance ref. So an Instance-stale conflict surfaces a
          // toast rather than auto-recovering (same limitation the
          // `instanceWrite` setup notes above). A real fix wants a discriminated
          // stale-instance error + an instance-version read action — M3
          // (UNN-468), where realtime/multi-tab makes a concurrent spatial
          // writer real.
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
          instanceWrite.bump(result.value.instanceVersion)
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
