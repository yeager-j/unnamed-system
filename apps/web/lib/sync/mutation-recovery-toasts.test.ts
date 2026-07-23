import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mutationRecoveryToasts } from "./mutation-recovery-toasts"

vi.mock("sonner", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }))

const messages = {
  delivery: "Delivery copy",
  freshness: "Freshness copy",
  conflict: "Conflict copy",
} as const

beforeEach(() => {
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.dismiss).mockReset()
})

describe("mutationRecoveryToasts", () => {
  it("creates actionable delivery, freshness, and conflict listeners", () => {
    const retryDelivery = vi.fn()
    const retryRefresh = vi.fn()
    const listeners = mutationRecoveryToasts({ scope: "test", messages })

    const dismissDelivery = listeners.onDeliveryUncertain?.({
      retry: retryDelivery,
    })
    const dismissFreshness = listeners.onFreshnessStalled?.({
      retry: retryRefresh,
      reason: "behind",
      missingAxes: [],
    })
    listeners.onConflict?.({
      mutationId: "m-1",
      invocation: {},
      error: "replay-refused",
    })
    expect(toast.error).toHaveBeenCalledWith("Delivery copy", {
      id: "test-delivery-uncertain",
      duration: Infinity,
      action: { label: "Retry", onClick: retryDelivery },
    })
    expect(toast.error).toHaveBeenCalledWith("Freshness copy", {
      id: "test-refresh-stalled",
      duration: Infinity,
      action: { label: "Refresh", onClick: retryRefresh },
    })
    expect(toast.error).toHaveBeenCalledWith("Conflict copy")

    dismissDelivery?.()
    dismissFreshness?.()
    expect(toast.dismiss).toHaveBeenNthCalledWith(1, "test-delivery-uncertain")
    expect(toast.dismiss).toHaveBeenNthCalledWith(2, "test-refresh-stalled")
  })
})
