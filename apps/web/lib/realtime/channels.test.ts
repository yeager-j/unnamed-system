import { afterEach, describe, expect, it, vi } from "vitest"

import { realtimeNamespace } from "./channels"

describe("realtimeNamespace", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("uses prod in production", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect(realtimeNamespace()).toBe("prod")
  })

  it("isolates previews by slugified branch", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "Feature/UNN-680_Watch!")
    expect(realtimeNamespace()).toBe("pr-feature-unn-680-watch")
  })

  it("uses dev outside Vercel", () => {
    vi.stubEnv("VERCEL_ENV", "")
    expect(realtimeNamespace()).toBe("dev")
  })

  it("uses a stable fallback when a preview ref is missing", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "")
    expect(realtimeNamespace()).toBe("pr-unknown")
  })
})
