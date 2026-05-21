import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb, sessions, users } from "@/lib/db"

/**
 * Dev-only sign-in helper. Lets an automation client (Claude, Playwright)
 * land a session cookie without going through Google OAuth. Fails closed on
 * any of four independent guards so the route is effectively non-existent in
 * any non-local context:
 *
 *  1. `NODE_ENV === "production"` → 404
 *  2. `DEV_AUTH_EMAIL` or `DEV_AUTH_PASSWORD` unset → 404
 *  3. Request `host` header not `localhost` / `127.0.0.1` (port-agnostic) → 404
 *  4. Email + password compared via `timingSafeEqual` over their SHA-256
 *     digests (equal-length, constant-time) → 404 on mismatch
 *
 * Failure mode is "no one can sign in" rather than "anyone can sign in" — the
 * route returns the same 404 response for every rejection so it doesn't leak
 * whether the route exists or which guard tripped.
 *
 * On success: looks up the user by `DEV_AUTH_EMAIL`, inserts a `session` row
 * via the same table the Drizzle adapter writes to (so `auth()` honours it),
 * and sets the `authjs.session-token` cookie. Tracked in UNN-185.
 */

const NOT_FOUND = (): NextResponse =>
  new NextResponse("Not Found", { status: 404 })

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Reject every non-POST method as a flat 404 instead of Next's default 405
 * — a 405 reveals that the route is defined, which we'd rather not leak.
 */
const respondNotFound = (): NextResponse => NOT_FOUND()
export {
  respondNotFound as GET,
  respondNotFound as PUT,
  respondNotFound as PATCH,
  respondNotFound as DELETE,
  respondNotFound as OPTIONS,
  respondNotFound as HEAD,
}

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return NOT_FOUND()

  const expectedEmail = process.env.DEV_AUTH_EMAIL
  const expectedPassword = process.env.DEV_AUTH_PASSWORD
  if (!expectedEmail || !expectedPassword) return NOT_FOUND()

  if (!isLocalhostHost(request.headers.get("host"))) return NOT_FOUND()

  const body = await readJsonBody(request)
  if (!body) return NOT_FOUND()

  const emailMatches = constantTimeEqual(body.email, expectedEmail)
  const passwordMatches = constantTimeEqual(body.password, expectedPassword)
  if (!emailMatches || !passwordMatches) return NOT_FOUND()

  const db = getDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, expectedEmail))
    .limit(1)

  if (!user) return NOT_FOUND()

  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    sessionToken,
    userId: user.id,
    expires,
  })

  const response = NextResponse.json({ ok: true })
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    expires,
  })
  return response
}

/** Allows `localhost`, `127.0.0.1`, and IPv6 loopback `::1` with or without a
 * `:port` suffix. Rejects everything else, including spoofed prefixes like
 * `localhost.evil.com`. */
function isLocalhostHost(host: string | null): boolean {
  if (!host) return false
  const hostname = host.replace(/^\[(.+)\](?::\d+)?$/, "$1").split(":")[0]
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  )
}

interface DevSignInBody {
  email: string
  password: string
}

async function readJsonBody(request: Request): Promise<DevSignInBody | null> {
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
    return raw as DevSignInBody
  } catch {
    return null
  }
}

/** Compare two strings in constant time. Hashing first makes the inputs
 * equal-length (so `timingSafeEqual` accepts them) and removes a length-based
 * timing side-channel. */
function constantTimeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest()
  const bh = createHash("sha256").update(b).digest()
  return timingSafeEqual(ah, bh)
}
