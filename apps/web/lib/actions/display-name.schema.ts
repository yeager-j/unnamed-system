import { z } from "zod/v4"

/**
 * A campaign thing's display name — non-empty, sanely bounded. Shared by the
 * world quick-mints, the folder CRUD, and the beat mint: every surface that
 * turns a typed name into a row asks the same question of it.
 */
export const displayNameSchema = z.string().trim().min(1).max(200)
