// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useSerializeLatest } from "./use-serialize-latest"

describe("useSerializeLatest", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("runs one save at a time and keeps only the newest waiting save per field", async () => {
    let finishFirst: (() => void) | undefined
    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve
        })
    )
    const superseded = vi.fn(async () => {})
    const latest = vi.fn(async () => {})
    const otherField = vi.fn(async () => {})
    const { result } = renderHook(() => useSerializeLatest())

    act(() => {
      result.current("name", first)
      result.current("content", superseded)
      result.current("name", otherField)
      result.current("content", latest)
    })

    expect(first).toHaveBeenCalledOnce()
    expect(superseded).not.toHaveBeenCalled()
    expect(latest).not.toHaveBeenCalled()
    expect(otherField).not.toHaveBeenCalled()

    await act(async () => {
      finishFirst!()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(otherField).toHaveBeenCalledOnce()
    expect(latest).toHaveBeenCalledOnce()
    expect(superseded).not.toHaveBeenCalled()
  })

  it("reports a thrown save and continues with the next waiting field", async () => {
    const error = new Error("offline")
    const onError = vi.fn()
    const failed = vi.fn(async () => {
      throw error
    })
    const next = vi.fn(async () => {})
    const { result } = renderHook(() => useSerializeLatest(onError))

    await act(async () => {
      result.current("name", failed)
      result.current("content", next)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledWith(error)
    expect(next).toHaveBeenCalledOnce()
  })
})
