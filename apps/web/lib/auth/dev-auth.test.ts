import { afterEach, describe, expect, it, vi } from "vitest"

import { isDevAuthAvailable } from "./dev-auth"

describe("isDevAuthAvailable", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([
    {
      name: "local development with a configured dev user",
      nodeEnv: "development",
      email: "dev@example.com",
      host: "localhost:3000",
      expected: true,
    },
    {
      name: "production",
      nodeEnv: "production",
      email: "dev@example.com",
      host: "localhost:3000",
      expected: false,
    },
    {
      name: "missing dev user",
      nodeEnv: "development",
      email: "",
      host: "localhost:3000",
      expected: false,
    },
    {
      name: "non-local host",
      nodeEnv: "development",
      email: "dev@example.com",
      host: "showtime.example.com",
      expected: false,
    },
  ])("returns $expected for $name", ({ nodeEnv, email, host, expected }) => {
    vi.stubEnv("NODE_ENV", nodeEnv)
    vi.stubEnv("DEV_AUTH_EMAIL", email)

    expect(isDevAuthAvailable(host)).toBe(expected)
  })
})
