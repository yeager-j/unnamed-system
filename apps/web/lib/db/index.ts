/**
 * Barrel for the `lib/db` package. Re-exports the Drizzle client
 * ({@link db}, {@link getDb}) and the full schema so consumers can import the
 * client and table/type definitions from one place (`@/lib/db`). The
 * per-role modules live under `client.ts`, `schema/`, `queries/`, and
 * `writes/`; import those directly when you only need one slice.
 */
export * from "./client"
export * from "./schema/user"
export * from "./schema/campaign"
export * from "./schema/character"
export * from "./schema/encounter"
