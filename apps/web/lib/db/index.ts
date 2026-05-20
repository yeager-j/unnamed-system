import { neon } from "@neondatabase/serverless"
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http"
import { getDbEnv } from "./env"
import * as schema from "./schema/user"

type Database = NeonHttpDatabase<typeof schema>

let cached: Database | undefined

function getDb(): Database {
  if (!cached) {
    cached = drizzle(neon(getDbEnv().DATABASE_URL), { schema })
  }
  return cached
}

/**
 * Drizzle client backed by Neon's serverless HTTP driver. Suitable for React
 * Server Components and Server Actions. Multi-statement interactive
 * transactions are not supported by `neon-http` — use `db.batch` for atomic
 * groups, or switch to `drizzle-orm/neon-serverless` if transactions become a
 * hard requirement.
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

export * from "./schema/user"
export * from "./schema/character"
