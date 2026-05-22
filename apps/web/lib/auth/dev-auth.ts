import { createHash, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb, users } from "@/lib/db"

/**
 * Shared guard chain for the dev-only auth routes (`/api/dev/sign-in`,
 * `/api/dev/sign-out`). Both routes fail closed on the same four guards:
 *
 *  1. `NODE_ENV === "production"` → 404
 *  2. `DEV_AUTH_EMAIL` or `DEV_AUTH_PASSWORD` unset → 404
 *  3. Request `host` header not `localhost` / `127.0.0.1` (port-agnostic) → 404
 *  4. Email + password compared via `timingSafeEqual` over their SHA-256
 *     digests (equal-length, constant-time) → 404 on mismatch
 *
 * Failure mode is "no one can authenticate" rather than "anyone can" — the
 * wire-level response is the same 404 for every rejection so it never reveals
 * whether the route exists or which guard tripped. The rejecting guard is
 * logged to the server console (only past guard 1) so a human or agent
 * debugging a misconfigured `.env.local` or wrong cwd can see *why* without
 * weakening the boundary.
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

interface DevAuthBody {
  email: string
  password: string
}

/**
 * Runs guards 1-4 and resolves the validated dev user's id. On success the
 * caller can act on the request; on failure they `return` the NextResponse
 * unchanged to short-circuit with a 404.
 */
export async function validateDevAuthRequest(
  request: Request,
  route: "sign-in" | "sign-out"
): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, response: NOT_FOUND() }
  }

  const expectedEmail = process.env.DEV_AUTH_EMAIL
  const expectedPassword = process.env.DEV_AUTH_PASSWORD
  if (!expectedEmail || !expectedPassword) {
    return {
      ok: false,
      response: rejectWithLog(
        route,
        "DEV_AUTH_EMAIL or DEV_AUTH_PASSWORD not set",
        "check .env.local in the repo root"
      ),
    }
  }

  const hostHeader = request.headers.get("host")
  if (!isLocalhostHost(hostHeader)) {
    return {
      ok: false,
      response: rejectWithLog(
        route,
        "host is not localhost",
        `got ${hostHeader ?? "null"}`
      ),
    }
  }

  const body = await readJsonBody(request)
  if (!body) {
    return {
      ok: false,
      response: rejectWithLog(route, "body missing or malformed JSON"),
    }
  }

  const emailMatches = constantTimeEqual(body.email, expectedEmail)
  const passwordMatches = constantTimeEqual(body.password, expectedPassword)
  if (!emailMatches || !passwordMatches) {
    return {
      ok: false,
      response: rejectWithLog(
        route,
        "email/password mismatch",
        "values must match .env.local exactly; dotenv strips wrapping quotes, shell extraction does not"
      ),
    }
  }

  const db = getDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, expectedEmail))
    .limit(1)

  if (!user) {
    return {
      ok: false,
      response: rejectWithLog(
        route,
        "user row missing",
        `no user with email ${expectedEmail}; run 'npm run db:seed'`
      ),
    }
  }

  return { ok: true, userId: user.id }
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

async function readJsonBody(request: Request): Promise<DevAuthBody | null> {
  try {
    const raw = (await request.json()) as unknown
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).email !== "string" ||
      typeof (raw as Record<string, unknown>).password !== "string"
    ) {
      return null
    }
    return raw as DevAuthBody
  } catch {
    return null
  }
}

/**
 * Constant-time string comparison. Hashing first makes inputs equal-length
 * (so `timingSafeEqual` accepts them) and removes a length-based timing
 * side-channel.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest()
  const bh = createHash("sha256").update(b).digest()
  return timingSafeEqual(ah, bh)
}
