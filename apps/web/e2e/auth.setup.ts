import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { eq } from "drizzle-orm"

import { getDb, sessions, users } from "@/lib/db"

/**
 * Playwright `globalSetup` that lands an authenticated session for the seeded
 * `claude@unnamed-system.local` user (see `lib/db/seed.ts`). Writes the
 * `authjs.session-token` cookie into a Playwright `storageState.json` that
 * specs opt into via `test.use({ storageState })`.
 *
 * The dev sign-in route (UNN-185 Part 1) is locked to `localhost`, so E2E —
 * which runs against the Vercel preview URL — gets a session a different way:
 * insert the `session` row directly via the same Drizzle adapter the runtime
 * uses, then synthesize the cookie. That keeps the HTTP route's safety
 * boundary tight AND gives CI a deterministic path with no OAuth round-trip.
 *
 * The CI workflow (`.github/workflows/e2e.yml`) already exports
 * `DATABASE_URL` for the resolved preview Neon branch before Playwright runs,
 * so no new secrets are needed.
 */

const STORAGE_STATE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.playwright/storage-state.json"
)

const DEV_USER_EMAIL = "claude@unnamed-system.local"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface StorageStateCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: "Strict" | "Lax" | "None"
}

interface StorageState {
  cookies: StorageStateCookie[]
  origins: never[]
}

export default async function globalSetup(): Promise<void> {
  loadRepoRootEnvIfPresent()

  const baseUrl = new URL(process.env.BASE_URL ?? "http://localhost:3000")
  const secure = baseUrl.protocol === "https:"
  const cookieName = `${secure ? "__Secure-" : ""}authjs.session-token`

  const db = getDb()
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEV_USER_EMAIL))
    .limit(1)

  if (!user) {
    throw new Error(
      `globalSetup: ${DEV_USER_EMAIL} not found. Run 'npm run db:seed' first.`
    )
  }

  const sessionToken = crypto.randomUUID()
  const expires = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({
    sessionToken,
    userId: user.id,
    expires,
  })

  const storageState: StorageState = {
    cookies: [
      {
        name: cookieName,
        value: sessionToken,
        domain: baseUrl.hostname,
        path: "/",
        expires: Math.floor(expires.getTime() / 1000),
        httpOnly: true,
        secure,
        sameSite: "Lax",
      },
    ],
    origins: [],
  }

  await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true })
  await writeFile(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
}

/** Public path to the generated storage state, for `test.use({ storageState })`. */
export const STORAGE_STATE = STORAGE_STATE_PATH

/**
 * Loads the repo-root `.env.local` into `process.env` if `DATABASE_URL` isn't
 * already set. Playwright runs this file outside of Next's runtime, so the
 * env-loading `next.config.ts` does doesn't apply — same shim as `seed.ts`.
 * In CI, `DATABASE_URL` is exported by the workflow before Playwright runs,
 * so this is a no-op.
 */
function loadRepoRootEnvIfPresent(): void {
  if (process.env.DATABASE_URL) return
  const envPath = fileURLToPath(new URL("../../../.env.local", import.meta.url))
  if (existsSync(envPath)) process.loadEnvFile(envPath)
}
