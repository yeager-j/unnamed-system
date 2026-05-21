import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import { getDb, sessions, users } from "@/lib/db"

/**
 * Dev-only sign-in helper. Lets an ad-hoc automation client (Claude in an
 * interactive session, a local dev script) land a session cookie without
 * going through Google OAuth. Fails closed on any of four independent
 * guards so the route is effectively non-existent in any non-local context:
 *
 *  1. `NODE_ENV === "production"` → 404
 *  2. `DEV_AUTH_EMAIL` or `DEV_AUTH_PASSWORD` unset → 404
 *  3. Request `host` header not `localhost` / `127.0.0.1` (port-agnostic) → 404
 *  4. Email + password compared via `timingSafeEqual` over their SHA-256
 *     digests (equal-length, constant-time) → 404 on mismatch
 *
 * Failure mode is "no one can sign in" rather than "anyone can sign in" — the
 * HTTP response is the same 404 for every rejection so the wire never reveals
 * whether the route exists or which guard tripped. In dev (anything past
 * guard 1) the rejecting guard is logged to the server console so a human
 * debugging a misconfigured `.env.local` or wrong cwd can see *why* without
 * weakening the wire-level boundary.
 *
 * On success: looks up the user by `DEV_AUTH_EMAIL`, inserts a `session` row
 * via the same table the Drizzle adapter writes to (so `auth()` honours it),
 * sets the `authjs.session-token` cookie, AND returns the `sessionToken` and
 * `cookieName` in the JSON body so an out-of-browser caller (curl, a
 * different process) can inject the cookie elsewhere without scraping the
 * `Set-Cookie` header.
 *
 * Playwright deliberately does *not* use this route — `e2e/auth.setup.ts`
 * inserts a `session` row directly via Drizzle so CI works against the
 * Vercel preview (where this route is 404-locked by guard 1) with no
 * additional secret material.
 *
 * @example Sign in from the Preview MCP browser (cookie lands automatically)
 *
 *   await fetch("/api/dev/sign-in", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ email: "…", password: "…" }),
 *   })
 *   // Subsequent requests in this browser context are now authenticated.
 *
 * @example Sign in from a shell, inject into the Preview browser
 *
 *   # Strip wrapping quotes that .env.local may carry; dotenv strips them
 *   # at runtime, but shell extraction does not.
 *   EMAIL=$(grep '^DEV_AUTH_EMAIL=' .env.local | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/')
 *   PASSWORD=$(grep '^DEV_AUTH_PASSWORD=' .env.local | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/')
 *   curl -s -X POST -H "Content-Type: application/json" \
 *     -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
 *     http://localhost:3000/api/dev/sign-in
 *   # → { "ok": true, "sessionToken": "…", "cookieName": "authjs.session-token" }
 *   # Then in the preview browser:
 *   #   document.cookie = `${cookieName}=${sessionToken}; path=/`
 *
 * Tracked in UNN-185; DX improvements (server-side guard logging, token in
 * response body, agent recipe in this JSDoc) added in UNN-176.
 */

const NOT_FOUND = (): NextResponse =>
  new NextResponse("Not Found", { status: 404 })

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const SESSION_COOKIE_NAME = "authjs.session-token"

/**
 * Logs which guard rejected the request to the dev server console so a human
 * (or agent) debugging a misconfigured `.env.local` or wrong cwd can see
 * *why* without changing what the wire returns. Only invoked after guard 1
 * (production short-circuit), so this never runs in `next build`-mode
 * runtimes — including Vercel preview, where `NODE_ENV === "production"`.
 */
function rejectWithLog(guard: string, detail?: string): NextResponse {
  console.warn(
    `[dev/sign-in] rejected: ${guard}${detail ? ` (${detail})` : ""}`
  )
  return NOT_FOUND()
}

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
  if (!expectedEmail || !expectedPassword) {
    return rejectWithLog(
      "DEV_AUTH_EMAIL or DEV_AUTH_PASSWORD not set",
      "check .env.local in the repo root"
    )
  }

  const hostHeader = request.headers.get("host")
  if (!isLocalhostHost(hostHeader)) {
    return rejectWithLog("host is not localhost", `got ${hostHeader ?? "null"}`)
  }

  const body = await readJsonBody(request)
  if (!body) return rejectWithLog("body missing or malformed JSON")

  const emailMatches = constantTimeEqual(body.email, expectedEmail)
  const passwordMatches = constantTimeEqual(body.password, expectedPassword)
  if (!emailMatches || !passwordMatches) {
    return rejectWithLog(
      "email/password mismatch",
      "values must match .env.local exactly; dotenv strips wrapping quotes, shell extraction does not"
    )
  }

  const db = getDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, expectedEmail))
    .limit(1)

  if (!user) {
    return rejectWithLog(
      "user row missing",
      `no user with email ${expectedEmail}; run 'npm run db:seed'`
    )
  }

  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    sessionToken,
    userId: user.id,
    expires,
  })

  const response = NextResponse.json({
    ok: true,
    sessionToken,
    cookieName: SESSION_COOKIE_NAME,
  })
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
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
