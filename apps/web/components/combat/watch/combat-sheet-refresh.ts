"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import { ownedSheetZoneEffectsKey } from "@/lib/combat/view/owned-sheet-zone-effects"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot-v2"

/**
 * Keeps the watch view's owned sheets in step with the battlefield: the sheets
 * are server-resolved props (their Skill cards bake in the combatant's
 * zone-sourced effects), while the snapshot updates client-side — so when the
 * polled snapshot implies different zone effects for an owned combatant, the
 * route is `router.refresh()`ed to re-pull them. The DM console needs no
 * analog: its event dispatch already refreshes after every write.
 */
export function useOwnedSheetZoneEffectsRefresh(
  snapshot: SpatialEncounterSnapshot,
  ownedSheets: OwnedEncounterSheet[]
): void {
  const router = useRouter()
  const key = ownedSheetZoneEffectsKey(
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
