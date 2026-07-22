"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"

const DELIVERY_TOAST_ID = "combat-delivery-uncertain"
const FRESHNESS_TOAST_ID = "combat-refresh-stalled"

export function useCombatFeedback(
  root: ReturnType<typeof useCombatPredictions>
): void {
  useEffect(() => {
    if (root.status.delivery === "uncertain") {
      toast.error("Connection lost mid-save — your combat change is kept.", {
        id: DELIVERY_TOAST_ID,
        duration: Infinity,
        action: { label: "Retry", onClick: root.retryDelivery },
      })
    } else {
      toast.dismiss(DELIVERY_TOAST_ID)
    }
  }, [root.status.delivery, root.retryDelivery])

  useEffect(() => {
    if (root.status.freshness === "stalled") {
      toast.error("Couldn't confirm the latest combat changes.", {
        id: FRESHNESS_TOAST_ID,
        duration: Infinity,
        action: { label: "Refresh", onClick: root.retryRefresh },
      })
    } else {
      toast.dismiss(FRESHNESS_TOAST_ID)
    }
  }, [root.status.freshness, root.retryRefresh])

  const surfacedConflicts = useRef(0)
  useEffect(() => {
    if (root.conflicts.length > surfacedConflicts.current) {
      surfacedConflicts.current = root.conflicts.length
      toast.error("A combat change was rolled back because the roster changed.")
    }
  }, [root.conflicts])
}
