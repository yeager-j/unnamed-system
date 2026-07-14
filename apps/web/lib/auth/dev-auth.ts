import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb, sessions, users } from "@/lib/db"

/**
 * Shared guard chain for the dev-only auth entry points: the home-panel
 * Server Action plus `/api/dev/sign-in` and `/api/dev/sign-out`. Every entry
 * point fails closed on the same three guards:
 *
 *  1. `NODE_ENV === "production"` → 404
 *  2. `DEV_AUTH_EMAIL` unset → 404
 *  3. Request `host` header not `localhost` / `127.0.0.1` (port-agnostic) → 404
 *
 * The route always signs in as the user identified by `DEV_AUTH_EMAIL`, so
 * the effective blast radius is one account — the dev user — reachable only
 * from a process already running on the same machine that's running the dev
 * server. The password check this previously carried was belt-and-suspenders
 * for a threat model the production/host guards already cover; dropping it
 * lets automated callers hit the route without funneling credentials through
 * tool calls or transcripts.
 *
 * Failure mode is "the route doesn't exist" rather than "the route refuses"
 * — the wire-level response is the same 404 for every rejection so it never
 * reveals whether the route exists or which guard tripped. The rejecting
 * guard is logged to the server console (only past guard 1) so a human or
 * agent debugging a misconfigured `.env.local` or wrong cwd can see *why*
 * without weakening the boundary.
 *
 * The dev/agent recipe lives in the per-route JSDoc.
 */

export const SESSION_COOKIE_NAME = "authjs.session-token"
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const NOT_FOUND = (): NextResponse =>
  new NextResponse("Not Found", { status: 404 })

/** Reject every non-POST method as a flat 404 — 405 would reveal the route. */
export const respondNotFound = (): NextResponse => NOT_FOUND()

/**
 * Logs which guard rejected the request to the server console. Only invoked
 * after the production short-circuit, so this never runs in `next build`-mode
 * runtimes (including Vercel preview, where `NODE_ENV === "production"`).
 */
function rejectWithLog(
  route: string,
  guard: string,
  detail?: string
): NextResponse {
  console.warn(
    `[dev/${route}] rejected: ${guard}${detail ? ` (${detail})` : ""}`
  )
  return NOT_FOUND()
}

type DevAuthBoundary =
  | { ok: true; expectedEmail: string }
  | { ok: false; guard?: string; detail?: string }

function validateDevAuthBoundary(hostHeader: string | null): DevAuthBoundary {
  if (process.env.NODE_ENV === "production") return { ok: false }

  const expectedEmail = process.env.DEV_AUTH_EMAIL
  if (!expectedEmail) {
    return {
      ok: false,
      guard: "DEV_AUTH_EMAIL not set",
      detail: "check .env.local in the repo root",
    }
  }

  if (!isLocalhostHost(hostHeader)) {
    return {
      ok: false,
      guard: "host is not localhost",
      detail: `got ${hostHeader ?? "null"}`,
    }
  }

  return { ok: true, expectedEmail }
}

/** Whether the local-only dev sign-in control is safe to render. */
export function isDevAuthAvailable(hostHeader: string | null): boolean {
  return validateDevAuthBoundary(hostHeader).ok
}

/** Resolve the configured dev user after enforcing the local-only boundary. */
export async function resolveDevAuthUser(
  hostHeader: string | null,
  route: "sign-in" | "sign-out"
): Promise<string | null> {
  const boundary = validateDevAuthBoundary(hostHeader)
  if (!boundary.ok) {
    if (boundary.guard) {
      rejectWithLog(route, boundary.guard, boundary.detail)
    }
    return null
  }

  const db = getDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, boundary.expectedEmail))
    .limit(1)

  if (!user) {
    rejectWithLog(
      route,
      "user row missing",
      `no user with email ${boundary.expectedEmail}; run 'npm run db:seed'`
    )
    return null
  }

  return user.id
}

/** Insert a normal Auth.js database session and return its browser cookie. */
export async function issueDevSession(userId: string): Promise<{
  name: typeof SESSION_COOKIE_NAME
  value: string
  options: {
    httpOnly: true
    sameSite: "lax"
    path: "/"
    secure: false
    expires: Date
  }
}> {
  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + SESSION_TTL_MS)

  await getDb().insert(sessions).values({ sessionToken, userId, expires })

  return {
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    options: {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      expires,
    },
  }
}

/**
 * Runs the guard chain and resolves the dev user's id. On success the caller
 * can act on the request; on failure they `return` the NextResponse unchanged
 * to short-circuit with a 404.
 */
export async function validateDevAuthRequest(
  request: Request,
  route: "sign-in" | "sign-out"
): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const userId = await resolveDevAuthUser(request.headers.get("host"), route)
  if (!userId) return { ok: false, response: NOT_FOUND() }

  return { ok: true, userId }
}

/**
 * Allows `localhost`, `127.0.0.1`, and IPv6 loopback `::1` with or without a
 * `:port` suffix. Rejects spoofed prefixes like `localhost.evil.com`.
 */
function isLocalhostHost(host: string | null): boolean {
  if (!host) return false
  const hostname = host.replace(/^\[(.+)\](?::\d+)?$/, "$1").split(":")[0]
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  )
}
