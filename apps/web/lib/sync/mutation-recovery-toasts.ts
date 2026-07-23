"use client"

import { toast } from "sonner"

import type { PredictedRootRecoveryListeners } from "@workspace/headcanon/react"

export interface MutationRecoveryToastMessages {
  readonly delivery: string
  readonly freshness: string
  readonly conflict?: string
}

export interface MutationRecoveryToastOptions {
  readonly scope: string
  readonly messages: MutationRecoveryToastMessages
}

/**
 * Creates persistent, actionable toast listeners for a predicted root's
 * recovery conditions. Copy stays with the app because it is UI policy; the
 * root supplies lifecycle events, cleanup timing, and retry actions.
 */
export function mutationRecoveryToasts({
  scope,
  messages,
}: MutationRecoveryToastOptions): PredictedRootRecoveryListeners<
  unknown,
  unknown
> {
  const deliveryToastId = `${scope}-delivery-uncertain`
  const freshnessToastId = `${scope}-refresh-stalled`
  const conflictMessage = messages.conflict

  return {
    onDeliveryUncertain({ retry }) {
      toast.error(messages.delivery, {
        id: deliveryToastId,
        duration: Infinity,
        action: { label: "Retry", onClick: retry },
      })
      return () => toast.dismiss(deliveryToastId)
    },
    onFreshnessStalled({ retry }) {
      toast.error(messages.freshness, {
        id: freshnessToastId,
        duration: Infinity,
        action: { label: "Refresh", onClick: retry },
      })
      return () => toast.dismiss(freshnessToastId)
    },
    onConflict: conflictMessage
      ? () => toast.error(conflictMessage)
      : undefined,
  }
}
