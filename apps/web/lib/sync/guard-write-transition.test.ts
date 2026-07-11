import { beforeEach, describe, expect, it, vi } from "vitest"

import { guardWrite, guardWriteTransition } from "./guard-write-transition"

// Mimic Next's `unstable_rethrow`: it re-throws framework navigation signals
// (tagged here with `__nextSignal`) and returns for everything else.
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "__nextSignal" in error
    ) {
      throw error
    }
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("guardWrite", () => {
  it("returns the resolved value and never calls onReject on success", async () => {
    const onReject = vi.fn()
    const result = await guardWrite(async () => "ok", onReject)

    expect(result).toBe("ok")
    expect(onReject).not.toHaveBeenCalled()
  })

  it("catches a thrown rejection: runs onReject and resolves to null", async () => {
    const onReject = vi.fn()
    const error = new Error("network down")

    const result = await guardWrite(async () => {
      throw error
    }, onReject)

    expect(result).toBeNull()
    expect(onReject).toHaveBeenCalledWith(error)
  })

  it("re-throws a Next navigation signal instead of swallowing it", async () => {
    const onReject = vi.fn()
    const signal = { __nextSignal: true }

    await expect(
      guardWrite(async () => {
        throw signal
      }, onReject)
    ).rejects.toBe(signal)
    // A redirect/forbidden/unauthorized must still navigate — not become a toast.
    expect(onReject).not.toHaveBeenCalled()
  })
})

describe("guardWriteTransition", () => {
  it("resolves void and runs onReject when the body throws", async () => {
    const onReject = vi.fn()

    await expect(
      guardWriteTransition(async () => {
        throw new Error("boom")
      }, onReject)
    ).resolves.toBeUndefined()
    expect(onReject).toHaveBeenCalledOnce()
  })

  it("re-throws a Next navigation signal from the body", async () => {
    const onReject = vi.fn()
    const signal = { __nextSignal: true }

    await expect(
      guardWriteTransition(async () => {
        throw signal
      }, onReject)
    ).rejects.toBe(signal)
    expect(onReject).not.toHaveBeenCalled()
  })
})
