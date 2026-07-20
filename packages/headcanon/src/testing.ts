import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useIncorporation, type RefreshAdapter } from "./refresh"
import { acceptedStamp, axisId, revisionVector, type Canon } from "./revisions"

export interface RefreshContractHarness {
  readonly name: string
  readonly useRefresh: (request: () => void | Promise<void>) => RefreshAdapter
}

const contractAxis = axisId("headcanon/refresh-contract")

function contractCanon(revision: number): Canon<number> {
  const parsed = revisionVector({ [contractAxis]: revision })
  if (!parsed.ok) throw new Error("Invalid refresh contract canon")
  return { value: revision, revisions: parsed.value }
}

function contractStamp(revision: number) {
  const parsed = revisionVector({ [contractAxis]: revision })
  if (!parsed.ok) throw new Error("Invalid refresh contract stamp")
  return acceptedStamp(parsed.value)
}

async function flushMicrotasks() {
  await act(async () => Promise.resolve())
}

async function advance(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms))
}

function setupRefreshContract(harness: RefreshContractHarness) {
  const request = vi.fn()
  const useRefresh = harness.useRefresh
  let acceptanceGraceMs = 0
  const rendered = renderHook(() => {
    const refresh = useRefresh(request)
    acceptanceGraceMs = refresh.acceptanceGraceMs
    return useIncorporation(contractCanon(0), refresh)
  })

  act(() =>
    rendered.result.current.recordAcceptance(
      "refresh-contract-mutation",
      contractStamp(1)
    )
  )

  return { ...rendered, acceptanceGraceMs, request }
}

export function verifyRefreshContract(harness: RefreshContractHarness): void {
  describe(`${harness.name} refresh contract`, () => {
    it("honors carrier grace and stalls after two uncovered refreshes", async () => {
      const { acceptanceGraceMs, result, request } =
        setupRefreshContract(harness)

      await flushMicrotasks()
      if (acceptanceGraceMs > 0) {
        expect(result.current.status.freshness).toBe("grace")
        expect(request).not.toHaveBeenCalled()
        await advance(acceptanceGraceMs)
      }

      expect(request).toHaveBeenCalledTimes(1)
      await advance(1_000)

      expect(request).toHaveBeenCalledTimes(2)
      expect(result.current.status).toMatchObject({
        freshness: "stalled",
        stallReason: "behind",
      })
    })

    it("gives manual retry a fresh two-attempt budget", async () => {
      const { acceptanceGraceMs, result, request } =
        setupRefreshContract(harness)

      await flushMicrotasks()
      if (acceptanceGraceMs > 0) await advance(acceptanceGraceMs)
      await advance(1_000)
      expect(result.current.status.freshness).toBe("stalled")

      act(() => result.current.retryRefresh())
      await flushMicrotasks()
      expect(request).toHaveBeenCalledTimes(3)

      await advance(1_000)
      expect(request).toHaveBeenCalledTimes(4)
      expect(result.current.status.freshness).toBe("stalled")
    })
  })
}
