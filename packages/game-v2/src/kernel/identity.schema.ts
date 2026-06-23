import { z } from "zod/v4"

/**
 * The **Identity** component (ADR §2.2): every entity carries one, so it is
 * universal rather than belonging to any single domain — hence its home in
 * `kernel/`. It is also the registry's seed component (the first key in
 * {@link import("./component-registry").ComponentRegistry}), which gives the
 * guard, load-seam, and Zod tests a real component to exercise before any domain
 * folder is populated.
 *
 * Per-component `*.schema.ts` files are pure authored shapes (D33): a Zod schema
 * + its inferred type, no logic and no port/catalog imports. The schema is the
 * load-seam contract; the inferred {@link Identity} is what the registry stores.
 */
export const identitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

export type Identity = z.infer<typeof identitySchema>
