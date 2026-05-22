import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

import {
  respondNotFound,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  validateDevAuthRequest,
} from "@/lib/auth/dev-auth"
import { getDb, sessions } from "@/lib/db"

/**
 * Dev-only sign-in helper. Lets an ad-hoc automation client (Claude in an
 * interactive session, a local dev script) land a session cookie without
 * going through Google OAuth. Fail-closed guard chain lives in
 * `lib/auth/dev-auth.ts#validateDevAuthRequest`; see that file for the
 * boundary semantics. The symmetric `POST /api/dev/sign-out` ends the
 * session.
 *
 * On success: inserts a `session` row via the same table the Drizzle adapter
 * writes to (so `auth()` honours it), sets the `authjs.session-token` cookie,
 * AND returns the `sessionToken` and `cookieName` in the JSON body so an
 * out-of-browser caller (curl, a different process) can inject the cookie
 * elsewhere without scraping the `Set-Cookie` header.
 *
 * Playwright deliberately does *not* use this route — `e2e/auth.setup.ts`
 * inserts a `session` row directly via Drizzle so CI works against the
 * Vercel preview (where this route is 404-locked by the production guard)
 * with no additional secret material.
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
 * Tracked in UNN-185; UNN-176 added the in-body session token + agent
 * recipe; UNN-177 extracted the shared guard chain and added the symmetric
 * sign-out.
 */

export {
  respondNotFound as GET,
  respondNotFound as PUT,
  respondNotFound as PATCH,
  respondNotFound as DELETE,
  respondNotFound as OPTIONS,
  respondNotFound as HEAD,
}

export async function POST(request: Request): Promise<NextResponse> {
  const validated = await validateDevAuthRequest(request, "sign-in")
  if (!validated.ok) return validated.response

  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + SESSION_TTL_MS)

  await getDb().insert(sessions).values({
    sessionToken,
    userId: validated.userId,
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
