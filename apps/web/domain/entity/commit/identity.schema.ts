import { z } from "zod/v4"

/**
 * The **serializable identity-write descriptor** (Headcanon P2c — UNN-675) — the
 * app-column species' answer to {@link import("./write.schema").entityWriteSchema}.
 *
 * Name, pronouns, portrait, and notes are app-owned `entity` **columns**, not
 * engine components, so they have no game-v2 Writer and no `durableClass` to
 * derive: they are the `identity` class by construction. What they now share with
 * the component species is the write *protocol* — one registered mutation
 * (`entity.identity`), one receipt, one axis (`entity/{id}/identity`), one cache
 * and invalidation path. The D35 column/component distinction survives as two
 * descriptors, not two protocols.
 *
 * **One field per invocation.** A control submits the field it changed; a
 * client-composed replacement for unrelated fields is unrepresentable, the same
 * per-field discipline the component descriptor gets structurally (UNN-226).
 *
 * The schema carries **bounds only** — no `.transform()`. Its parsed output must
 * be re-admissible as its own input, because the client sends the caller-supplied
 * args verbatim and the authority parses them again; a transform whose output the
 * schema rejects (`"" → null`, then `null` failing a `z.string()`) would fail the
 * second parse. Canonicalization therefore lives in
 * {@link import("./identity").identityWritePatch}, which both the predictor and
 * the authority run — so the predicted value and the stored column agree by
 * construction.
 */
export const identityWriteSchema = z.discriminatedUnion("field", [
  /** Mirrors v1's name rules: trimmed, required, 64-char cap. */
  z.object({
    field: z.literal("name"),
    value: z.string().trim().min(1, "Name is required").max(64),
  }),
  z.object({
    field: z.literal("pronouns"),
    value: z.string().max(64).nullable(),
  }),
  /**
   * The free-form Notes column. Unlike name, an empty body is legitimate — a
   * cleared note canonicalizes to `null` (the narrative prose fields' empty→null
   * rule). The 8000-char cap matches `NARRATIVE_TEXT_MAX` so both long-form
   * surfaces share one bound.
   */
  z.object({
    field: z.literal("notes"),
    value: z.string().max(8000).nullable(),
  }),
  /** The Blob URL a completed upload produced — the Blob write itself happens
   *  before the mutation, never inside the rerunnable handler. */
  z.object({
    field: z.literal("portraitUrl"),
    value: z.url().nullable(),
  }),
])

export type IdentityWrite = z.infer<typeof identityWriteSchema>

/** The identity column a write targets — the descriptor's discriminant. */
export type IdentityField = IdentityWrite["field"]
