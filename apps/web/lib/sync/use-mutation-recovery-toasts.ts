"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

export interface MutationRecoveryRoot {
  readonly status: {
    readonly delivery: "idle" | "sending" | "uncertain"
    readonly freshness: "current" | "grace" | "refreshing" | "stalled"
  }
  readonly conflicts: readonly unknown[]
  readonly retryDelivery: () => void
  readonly retryRefresh: () => void
}

export interface MutationRecoveryToastMessages {
  readonly delivery: string
  readonly freshness: string
  readonly conflict: string
}

export interface MutationRecoveryToastOptions {
  readonly scope: string
  readonly messages: MutationRecoveryToastMessages
}

/**
 * Maps the public degraded-state surface of a predicted root to persistent,
 * actionable toasts. Copy stays with the app surface because it is UI policy;
 * the root only supplies lifecycle state and retry actions.
 */
export function useMutationRecoveryToasts(
  root: MutationRecoveryRoot,
  { scope, messages }: MutationRecoveryToastOptions
): void {
  const deliveryToastId = `${scope}-delivery-uncertain`
  const freshnessToastId = `${scope}-refresh-stalled`

  useEffect(() => {
    if (root.status.delivery === "uncertain") {
      toast.error(messages.delivery, {
        id: deliveryToastId,
        duration: Infinity,
        action: { label: "Retry", onClick: root.retryDelivery },
      })
    } else {
      toast.dismiss(deliveryToastId)
    }
  }, [
    deliveryToastId,
    messages.delivery,
    root.retryDelivery,
    root.status.delivery,
  ])

  useEffect(() => {
    if (root.status.freshness === "stalled") {
      toast.error(messages.freshness, {
        id: freshnessToastId,
        duration: Infinity,
        action: { label: "Refresh", onClick: root.retryRefresh },
      })
    } else {
      toast.dismiss(freshnessToastId)
    }
  }, [
    freshnessToastId,
    messages.freshness,
    root.retryRefresh,
    root.status.freshness,
  ])

  const surfacedConflicts = useRef(0)
  useEffect(() => {
    if (root.conflicts.length > surfacedConflicts.current) {
      surfacedConflicts.current = root.conflicts.length
      toast.error(messages.conflict)
    }
  }, [messages.conflict, root.conflicts])
}
