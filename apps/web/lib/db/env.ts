import { z } from "zod"

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
})

/**
 * Validated database environment. Parsing happens at import time so a
 * missing or empty `DATABASE_URL` fails fast on startup rather than on the
 * first query.
 */
export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
})
