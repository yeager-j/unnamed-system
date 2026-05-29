import { Pool } from "@neondatabase/serverless"
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless"

import { getDbEnv } from "./env"
import * as schema from "./schema/user"

type Database = NeonDatabase<typeof schema>

let cached: Database | undefined

/**
 * Returns the lazily-initialized Drizzle client. Prefer importing {@link db}
 * (the auto-resolving Proxy) for normal queries; reach for this helper when
 * you need the underlying instance for libraries that runtime-check the
 * Drizzle entity kind (e.g. `@auth/drizzle-adapter`'s `is(db, PgDatabase)`),
 * which a Proxy can't satisfy without prototype-chain trickery.
 */
export function getDb(): Database {
  if (!cached) {
    const pool = new Pool({ connectionString: getDbEnv().DATABASE_URL })
    cached = drizzle(pool, { schema })
  }
  return cached
}

/**
 * Drizzle client backed by Neon's serverless WebSocket driver. Suitable for
 * React Server Components, route handlers, and Server Actions, and supports
 * interactive transactions (`db.transaction(...)`) — required by
 * `@auth/drizzle-adapter`'s `linkAccount` path and by future concurrency-safe
 * character writes (UNN-140).
 *
 * The underlying client is created lazily on first use (via {@link getDb}) so
 * importing this module never requires `DATABASE_URL` — that keeps
 * `next build` page-data collection working for DB-backed routes while still
 * failing fast on the first actual query when the env is missing.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const instance = getDb()
    const value = Reflect.get(instance, property, instance)
    return typeof value === "function" ? value.bind(instance) : value
  },
})
