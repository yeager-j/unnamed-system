// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DevSignInButton } from "./dev-sign-in-button"

const requestHeaders = vi.fn()
const isDevAuthAvailable = vi.fn()

vi.mock("next/headers", () => ({ headers: () => requestHeaders() }))
vi.mock("@/lib/auth/actions", () => ({ devSignInAction: vi.fn() }))
vi.mock("@/lib/auth/dev-auth", () => ({
  isDevAuthAvailable: (hostHeader: string | null) =>
    isDevAuthAvailable(hostHeader),
}))

beforeEach(() => {
  vi.clearAllMocks()
  requestHeaders.mockResolvedValue(new Headers({ host: "localhost:3000" }))
  isDevAuthAvailable.mockReturnValue(true)
})

afterEach(cleanup)

describe("DevSignInButton", () => {
  it("renders the browser-native sign-in form when dev auth is available", async () => {
    render(await DevSignInButton())

    expect(screen.getByRole("button", { name: "Dev sign in" })).toBeTruthy()
    expect(isDevAuthAvailable).toHaveBeenCalledWith("localhost:3000")
  })

  it("renders nothing outside the dev-auth boundary", async () => {
    isDevAuthAvailable.mockReturnValue(false)

    render(await DevSignInButton())

    expect(screen.queryByRole("button", { name: "Dev sign in" })).toBeNull()
  })
})
