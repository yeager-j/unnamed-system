import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

import {
  respondNotFound,
  SESSION_COOKIE_NAME,
  validateDevAuthRequest,
} from "@/lib/auth/dev-auth"
import { getDb, sessions } from "@/lib/db"

/**
 * Dev-only sign-out helper, the symmetric counterpart to
 * `/api/dev/sign-in`. Lets an agent flip back to a signed-out state without
 * reverse-engineering the Auth.js CSRF flow (`GET /api/auth/csrf` then `POST
 * /api/auth/signout` with `csrfToken` + `json=true`).
 *
 * Same fail-closed guard chain as sign-in (see
 * `lib/auth/dev-auth.ts#validateDevAuthRequest`) — guarding sign-out behind
 * the same dev credentials means a misbehaving page can't silently log the
 * agent out mid-session.
 *
 * On success: deletes every `session` row owned by the `DEV_AUTH_EMAIL`
 * user (a single user in practice, so the blast radius equals the agent's
 * own sessions) and clears the `authjs.session-token` cookie. Idempotent —
 * calling it without an active session still returns 200.
 *
 * @example Sign out from the Preview MCP browser
 *
 *   await fetch("/api/dev/sign-out", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ email: "…", password: "…" }),
 *   })
 *   // Subsequent requests in this browser context are now signed out.
 *
 * Added in UNN-177 alongside the My Characters home page, where the
 * signed-out landing is one of the states an agent needs to verify.
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
  const validated = await validateDevAuthRequest(request, "sign-out")
  if (!validated.ok) return validated.response

  await getDb().delete(sessions).where(eq(sessions.userId, validated.userId))

  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
