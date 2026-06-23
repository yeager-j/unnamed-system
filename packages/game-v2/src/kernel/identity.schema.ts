import { z } from "zod/v4"

/**
 * The **Identity** component: the entity's display name. Every entity carries
 * one, so it is universal rather than belonging to any single domain — hence its
 * home in `kernel/`. It is also the registry's seed component (the first key in
 * {@link import("./component-registry").ComponentRegistry}), which gives the
 * guard, load-seam, and Zod tests a real component to exercise before any domain
 * folder is populated.
 *
 * **It deliberately does not carry `id`.** The entity key is the single
 * top-level `EntityG.id` (D16) — the one fact that *identifies* the entity — so
 * duplicating it here would be a value that can only drift, never inform. `name`,
 * by contrast, belongs in a component precisely because it must flow through the
 * uniform per-component passes: redaction drops/keeps the whole `identity` key
 * per viewer (D20 — a spectator may not see an enemy's name), and rendering binds
 * a widget to the component (D7). At rest, a durable entity's `name` is a
 * queryable column (§2.2) the loader projects into this component; an ephemeral
 * entity carries it inline.
 *
 * Per-component `*.schema.ts` files are pure authored shapes (D33): a Zod schema
 * + its inferred type, no logic and no port/catalog imports. The schema is the
 * load-seam contract; the inferred {@link Identity} is what the registry stores.
 */
export const identitySchema = z.object({
  name: z.string().min(1),
})

export type Identity = z.infer<typeof identitySchema>
