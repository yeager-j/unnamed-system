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
 * **No request body.** Same fail-closed guard chain as sign-in (production
 * mode → 404, missing `DEV_AUTH_EMAIL` → 404, non-localhost host → 404); see
 * `lib/auth/dev-auth.ts#validateDevAuthRequest`.
 *
 * On success: deletes every `session` row owned by the `DEV_AUTH_EMAIL`
 * user (a single user in practice, so the blast radius equals the agent's
 * own sessions) and clears the `authjs.session-token` cookie. Idempotent —
 * calling it without an active session still returns 200.
 *
 * @example Sign out from the built-in browser
 *
 *   Open the account menu and click "Sign out".
 *
 * @example Sign out from a browser client that can execute page scripts
 *
 *   await fetch("/api/dev/sign-out", { method: "POST" })
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
