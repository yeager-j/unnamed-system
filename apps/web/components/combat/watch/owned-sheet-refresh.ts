"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import { ownedSheetRefreshKey } from "@/domain/combat/view/owned-sheet-refresh-key"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot"

/**
 * Keeps the watch view's owned sheets in step with the battlefield: the sheets
 * are server-resolved props, while the snapshot updates client-side — so when
 * the polled snapshot implies a different sheet for an owned combatant (its zone
 * effects changed, or the DM moved its pools), the route is `router.refresh()`ed
 * to re-pull them. Keyed on {@link ownedSheetRefreshKey}, so end-turns, enemy
 * damage, and moves between un-Enchanted Zones never trigger a refresh.
 *
 * This is the **degraded path's** catch-up. With realtime up, a durable commit
 * pings `character:{shortId}` and the provider's own listener refreshes first,
 * so this hook sees a key it has already caught up to and no-ops. With no
 * `ABLY_API_KEY`, it is the only thing reconciling the DM's writes into the
 * column. Own writes cost one redundant refresh against a base frame that
 * already matches — invisible, and the price of never rendering two HP values
 * for one character at once.
 *
 * The DM console needs no analog: its event dispatch already refreshes after
 * every write.
 */
export function useOwnedSheetRefresh(
  snapshot: SpatialEncounterSnapshot,
  ownedSheets: OwnedEncounterSheet[]
): void {
  const router = useRouter()
  const key = ownedSheetRefreshKey(
    snapshot,
    ownedSheets.map((sheet) => sheet.participantId)
  )
  const lastKey = useRef(key)

  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    router.refresh()
  }, [key, router])
}
