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
 *
 * **`id` authority:** the canonical entity identifier is the entity-level
 * `EntityG.id` (the value `loadEntity(id, …)` receives). `Identity.id` is the
 * same id materialized inside the durable record (so a serialized Identity is
 * self-describing, mirroring v1 where the character row's id and its hydrated
 * identity coincide); the two must agree, and the entity-level id wins on any
 * disagreement. A later PR may drop the duplicate once an Identity consumer
 * exists to settle it — noted, not load-bearing in PR1.
 */
export const identitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

export type Identity = z.infer<typeof identitySchema>
