"use client"

import type { useCombatPredictions } from "@/domain/combat/use-combat-predictions"
import { useMutationRecoveryToasts } from "@/lib/sync/use-mutation-recovery-toasts"

const COMBAT_RECOVERY_TOASTS = {
  scope: "combat",
  messages: {
    delivery: "Connection lost mid-save — your combat change is kept.",
    freshness: "Couldn't confirm the latest combat changes.",
    conflict: "A combat change was rolled back because the roster changed.",
  },
} as const

export function useCombatFeedback(
  root: ReturnType<typeof useCombatPredictions>
): void {
  useMutationRecoveryToasts(root, COMBAT_RECOVERY_TOASTS)
}
