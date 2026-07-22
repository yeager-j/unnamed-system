import { afterEach, describe, expect, it, vi } from "vitest"

import { GET, POST } from "./route"

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
      tokenRequest({ capability: { [AXIS_CHANNEL]: ["subscribe"] } })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ available: false })
  })

  it("rejects a malformed body", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const response = await POST(tokenRequest({ capability: {} }))

    expect(response.status).toBe(400)
  })
})

const AXIS_CHANNEL = `dev:headcanon:axis:v1:${"a".repeat(64)}`

describe("POST /api/realtime/token — Headcanon axis capabilities (UNN-676)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("signs a subscribe-only token for exactly the requested axis channels", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const response = await POST(
      tokenRequest({ capability: { [AXIS_CHANNEL]: ["subscribe"] } })
    )

    expect(response.status).toBe(200)
    const { tokenRequest: issued } = await response.json()
    expect(JSON.parse(issued.capability)).toEqual({
      [AXIS_CHANNEL]: ["subscribe"],
    })
  })

  it("rejects a channel outside this deployment's axis namespace", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    for (const channel of [
      `prod:headcanon:axis:v1:${"a".repeat(64)}`, // another deployment
      "dev:character:abc123", // a ping channel via the axis shape
      "dev:headcanon:axis:v1:not-hex", // malformed hash
    ]) {
      const response = await POST(
        tokenRequest({ capability: { [channel]: ["subscribe"] } })
      )
      expect(response.status).toBe(400)
    }
  })

  it("rejects a publish grant and an empty capability", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const publish = await POST(
      tokenRequest({ capability: { [AXIS_CHANNEL]: ["publish"] } })
    )
    expect(publish.status).toBe(400)

    const empty = await POST(tokenRequest({ capability: {} }))
    expect(empty.status).toBe(400)
  })
})

describe("GET /api/realtime/token", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("exposes the deployment namespace so clients can derive axis channels", async () => {
    vi.stubEnv("ABLY_API_KEY", FAKE_ABLY_KEY)

    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ available: true, namespace: "dev" })
  })

  it("reports unavailable with ABLY_API_KEY unset", async () => {
    vi.stubEnv("ABLY_API_KEY", "")

    const response = await GET()
    expect(response.status).toBe(503)
  })
})
