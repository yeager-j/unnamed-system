import { NextResponse } from "next/server"

import {
  issueDevSession,
  respondNotFound,
  validateDevAuthRequest,
} from "@/lib/auth/dev-auth"

/**
 * Dev-only sign-in helper. Lets an ad-hoc automation client (Claude in an
 * interactive session, a local dev script) land a session cookie without
 * going through Google OAuth. Fail-closed guard chain lives in
 * `lib/auth/dev-auth.ts#validateDevAuthRequest`; see that file for the
 * boundary semantics. The symmetric `POST /api/dev/sign-out` ends the
 * session.
 *
 * **No request body.** The route always signs in as the user identified by
 * `DEV_AUTH_EMAIL`, gated by the production-mode and localhost-host guards.
 * The earlier password requirement was belt-and-suspenders the guards
 * already covered, and it forced automation callers to launder credentials
 * through tool calls; dropping it removes that friction.
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
 * @example Sign in from the built-in browser
 *
 *   Open `/` and click "Dev sign in" in the signed-out home panel.
 *
 * @example Sign in from a browser client that can execute page scripts
 *
 *   await fetch("/api/dev/sign-in", { method: "POST" })
 *   // Subsequent requests in this browser context are now authenticated.
 *
 * @example Sign in from a shell
 *
 *   curl -s -X POST http://localhost:3000/api/dev/sign-in
 *   # → { "ok": true, "sessionToken": "…", "cookieName": "authjs.session-token" }
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

  const sessionCookie = await issueDevSession(validated.userId)

  const response = NextResponse.json({
    ok: true,
    sessionToken: sessionCookie.value,
    cookieName: sessionCookie.name,
  })
  response.cookies.set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.options
  )
  return response
}
