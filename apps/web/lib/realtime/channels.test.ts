import { afterEach, describe, expect, it, vi } from "vitest"

import { realtimeChannelName } from "./channels"

describe("realtimeChannelName", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("namespaces with prod in production", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main")

    expect(realtimeChannelName("character", "abc123")).toBe(
      "prod:character:abc123"
    )
  })

  it("namespaces with the slugified branch ref in preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/unn-370-realtime")

    expect(realtimeChannelName("encounter", "abc123")).toBe(
      "pr-feature-unn-370-realtime:encounter:abc123"
    )
  })

  it("namespaces with dev when not on Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "")

    expect(realtimeChannelName("character", "abc123")).toBe(
      "dev:character:abc123"
    )
  })

  it("names the dungeon domain channel", () => {
    vi.stubEnv("VERCEL_ENV", "")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "")

    expect(realtimeChannelName("dungeon", "delve9")).toBe("dev:dungeon:delve9")
  })

  it("gives the same shortId different names on different preview branches", () => {
    vi.stubEnv("VERCEL_ENV", "preview")

    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "claude/unn-371-watch-view")
    const onBranchA = realtimeChannelName("encounter", "abc123")

    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "claude/unn-372-character-sheet")
    const onBranchB = realtimeChannelName("encounter", "abc123")

    expect(onBranchA).toBe("pr-claude-unn-371-watch-view:encounter:abc123")
    expect(onBranchB).toBe("pr-claude-unn-372-character-sheet:encounter:abc123")
    expect(onBranchA).not.toBe(onBranchB)
  })

  it("gives the same shortId different names on preview vs prod", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main")
    const onPreview = realtimeChannelName("character", "abc123")

    vi.stubEnv("VERCEL_ENV", "production")
    const onProd = realtimeChannelName("character", "abc123")

    expect(onPreview).not.toBe(onProd)
  })

  it("slugifies refs with uppercase and special characters", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "Feature/UNN-370_Realtime!")

    expect(realtimeChannelName("character", "abc123")).toBe(
      "pr-feature-unn-370-realtime:character:abc123"
    )
  })

  it("falls back to a stable namespace when the preview ref is missing", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "")

    expect(realtimeChannelName("character", "abc123")).toBe(
      "pr-unknown:character:abc123"
    )
  })
})
