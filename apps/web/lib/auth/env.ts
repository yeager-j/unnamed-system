import { z } from "zod/v4"

const envSchema = z.object({
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  AUTH_REDIRECT_PROXY_URL: z.url().optional(),
})

type AuthEnv = z.infer<typeof envSchema>

let cached: AuthEnv | undefined

/**
 * Validated Auth.js environment, parsed lazily on first call rather than at
 * import time — matching the {@link getDbEnv} pattern so importing the auth
 * module never requires secrets. `next build` collects page data without
 * touching the OAuth flow; only an actual sign-in (or `auth()` reading the
 * cookie) hits validation.
 *
 * `AUTH_REDIRECT_PROXY_URL` is only set on Vercel preview deployments — it
 * forwards OAuth callbacks through the production host so Google only needs
 * one redirect URI registered.
 */
export function getAuthEnv(): AuthEnv {
  cached ??= envSchema.parse({
    AUTH_SECRET: process.env.AUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    AUTH_REDIRECT_PROXY_URL: process.env.AUTH_REDIRECT_PROXY_URL,
  })
  return cached
}
