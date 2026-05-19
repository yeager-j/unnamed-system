import { z } from "zod/v4"

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
})

type DbEnv = z.infer<typeof envSchema>

let cached: DbEnv | undefined

/**
 * Validated database environment, parsed lazily on first call rather than at
 * import time. Merely importing the db module — which `next build` does while
 * collecting page data for DB-backed routes — must not require `DATABASE_URL`;
 * only actually touching the database does. The first query still fails fast
 * if it is missing or empty.
 */
export function getDbEnv(): DbEnv {
  cached ??= envSchema.parse({ DATABASE_URL: process.env.DATABASE_URL })
  return cached
}
