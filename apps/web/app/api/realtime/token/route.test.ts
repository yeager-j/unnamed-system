import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"

// The realtime client guards itself with `server-only`, which throws outside
// a server-component module graph; neutralize it so the route under test can
// build its real Ably client (token requests are signed locally — no network).
vi.mock("server-only", () => ({}))

const FAKE_ABLY_KEY = "fakeApp.fakeKey:fake-secret-for-local-hmac"

function tokenRequest(body: unknown): Request {
  return new Request("http://localhost/api/realtime/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/realtime/token", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("reports unavailable with ABLY_API_KEY unset so clients fall back to polling", async () => {
    vi.stubEnv("ABLY_API_KEY", "")

    const response = await POST(
      tokenRequest({ domain: "character", shortId: "abc123" })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ available: false })
  })

  it("rejects a malformed body", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const response = await POST(
      tokenRequest({ domain: "everything", shortId: "" })
    )

    expect(response.status).toBe(400)
  })

  it("resolves the channel server-side and issues a subscribe-only capability for exactly that channel", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const response = await POST(
      tokenRequest({ domain: "character", shortId: "abc123" })
    )

    expect(response.status).toBe(200)
    const { channel, tokenRequest: issued } = await response.json()
    expect(channel).toBe("dev:character:abc123")
    expect(JSON.parse(issued.capability)).toEqual({
      "dev:character:abc123": ["subscribe"],
    })
  })

  it("issues a token for the dungeon domain", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const response = await POST(
      tokenRequest({ domain: "dungeon", shortId: "delve9" })
    )

    expect(response.status).toBe(200)
    const { channel, tokenRequest: issued } = await response.json()
    expect(channel).toBe("dev:dungeon:delve9")
    expect(JSON.parse(issued.capability)).toEqual({
      "dev:dungeon:delve9": ["subscribe"],
    })
  })
})
