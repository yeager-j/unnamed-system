import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { env } from "./env"
import * as schema from "./schema"

const sql = neon(env.DATABASE_URL)

/**
 * Drizzle client backed by Neon's serverless HTTP driver. Suitable for
 * React Server Components and Server Actions. Multi-statement interactive
 * transactions are not supported by `neon-http` — use `db.batch` for atomic
 * groups, or switch to `drizzle-orm/neon-serverless` if transactions become
 * a hard requirement.
 */
export const db = drizzle(sql, { schema })

export * from "./schema"
