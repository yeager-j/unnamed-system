"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import {
  zoneEnchantmentEffects,
  type EncounterSnapshot,
} from "@workspace/game/engine"

import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot"

/**
 * The zone-sourced effects each owned combatant's sheet should currently be
 * hydrated with, folded to a comparable key — exactly the
 * {@link zoneEnchantmentEffects} input `loadOwnedEncounterSheets` resolves
 * server-side, so the key changes precisely when a re-hydration would produce
 * a different sheet (Enchantment applied / raised / cleared / moved, or an
 * owned combatant changing Zone).
 */
export function ownedSheetZoneEffectsKey(
  snapshot: Pick<EncounterSnapshot, "enchantment" | "combatants">,
  ownedSheets: ReadonlyArray<Pick<OwnedEncounterSheet, "combatantId">>
): string {
  return JSON.stringify(
    ownedSheets.map((sheet) => {
      const combatant = snapshot.combatants.find(
        (candidate) => candidate.id === sheet.combatantId
      )
      return combatant
        ? zoneEnchantmentEffects(snapshot.enchantment, combatant.zoneId)
        : []
    })
  )
}

/**
 * Keeps the watch view's owned sheets in step with the battlefield: the sheets
 * are server-hydrated props (their skill cards bake in the combatant's
 * zone-sourced effects), while the snapshot updates client-side — so when the
 * polled snapshot implies different zone effects for an owned combatant, the
 * route is `router.refresh()`ed to re-pull the sheets. Keyed on the resolved
 * effects (not the raw session), so end-turns, moves between un-Enchanted
 * Zones, and vitals churn never trigger a refresh; the no-sheet spectator's
 * key is a constant. The DM console needs no analog — its event dispatch
 * already refreshes after every write.
 */
export function useOwnedSheetZoneEffectsRefresh(
  snapshot: EncounterSnapshot,
  ownedSheets: OwnedEncounterSheet[]
): void {
  const router = useRouter()
  const key = ownedSheetZoneEffectsKey(snapshot, ownedSheets)
  const lastKey = useRef(key)

  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    router.refresh()
  }, [key, router])
}
