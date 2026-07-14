import { beforeEach, describe, expect, it, vi } from "vitest"

import { devSignInAction } from "./actions"

const requestHeaders = vi.fn()
const setCookie = vi.fn()
const resolveDevAuthUser = vi.fn()
const issueDevSession = vi.fn()

class NotFoundError extends Error {}

class RedirectError extends Error {
  constructor(readonly destination: string) {
    super(`redirect:${destination}`)
  }
}

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: setCookie }),
  headers: () => requestHeaders(),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError("not found")
  },
  redirect: (destination: string) => {
    throw new RedirectError(destination)
  },
}))
vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock("@/lib/auth/dev-auth", () => ({
  issueDevSession: (userId: string) => issueDevSession(userId),
  resolveDevAuthUser: (hostHeader: string | null, route: string) =>
    resolveDevAuthUser(hostHeader, route),
}))

const sessionCookie = {
  name: "authjs.session-token",
  value: "session-token",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: false,
    expires: new Date("2026-08-12T00:00:00.000Z"),
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  requestHeaders.mockResolvedValue(new Headers({ host: "localhost:3000" }))
  resolveDevAuthUser.mockResolvedValue("user-1")
  issueDevSession.mockResolvedValue(sessionCookie)
})

describe("devSignInAction", () => {
  it("issues a guarded session cookie and redirects home", async () => {
    await expect(devSignInAction()).rejects.toMatchObject({ destination: "/" })

    expect(resolveDevAuthUser).toHaveBeenCalledWith("localhost:3000", "sign-in")
    expect(issueDevSession).toHaveBeenCalledWith("user-1")
    expect(setCookie).toHaveBeenCalledWith(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.options
    )
  })

  it("fails closed before issuing a session", async () => {
    resolveDevAuthUser.mockResolvedValue(null)

    await expect(devSignInAction()).rejects.toBeInstanceOf(NotFoundError)

    expect(issueDevSession).not.toHaveBeenCalled()
    expect(setCookie).not.toHaveBeenCalled()
  })
})
