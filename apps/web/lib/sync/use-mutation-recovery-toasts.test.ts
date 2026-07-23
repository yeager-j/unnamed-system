// @vitest-environment jsdom

import { renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  useMutationRecoveryToasts,
  type MutationRecoveryRoot,
} from "./use-mutation-recovery-toasts"

vi.mock("sonner", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }))

const messages = {
  delivery: "Delivery copy",
  freshness: "Freshness copy",
  conflict: "Conflict copy",
} as const

function root(
  overrides: Partial<MutationRecoveryRoot> = {}
): MutationRecoveryRoot {
  return {
    status: { delivery: "idle", freshness: "current" },
    conflicts: [],
    retryDelivery: vi.fn(),
    retryRefresh: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.dismiss).mockReset()
})

describe("useMutationRecoveryToasts", () => {
  it("surfaces uncertain delivery, stalled freshness, and new conflicts", () => {
    const current = root({
      status: { delivery: "uncertain", freshness: "stalled" },
      conflicts: [{}],
    })

    renderHook(() =>
      useMutationRecoveryToasts(current, { scope: "test", messages })
    )

    expect(toast.error).toHaveBeenCalledWith("Delivery copy", {
      id: "test-delivery-uncertain",
      duration: Infinity,
      action: { label: "Retry", onClick: current.retryDelivery },
    })
    expect(toast.error).toHaveBeenCalledWith("Freshness copy", {
      id: "test-refresh-stalled",
      duration: Infinity,
      action: { label: "Refresh", onClick: current.retryRefresh },
    })
    expect(toast.error).toHaveBeenCalledWith("Conflict copy")
  })

  it("dismisses recovery toasts once the root recovers", () => {
    const { rerender } = renderHook(
      ({ current }: { current: MutationRecoveryRoot }) =>
        useMutationRecoveryToasts(current, { scope: "test", messages }),
      { initialProps: { current: root() } }
    )

    rerender({
      current: root({
        status: { delivery: "sending", freshness: "refreshing" },
      }),
    })

    expect(toast.dismiss).toHaveBeenCalledWith("test-delivery-uncertain")
    expect(toast.dismiss).toHaveBeenCalledWith("test-refresh-stalled")
  })
})
