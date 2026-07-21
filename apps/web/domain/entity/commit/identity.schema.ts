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
/**
 * The exact shape `uploadPortrait` mints: a public Vercel Blob object at the
 * randomized `portraits/{uuid}.{ext}` path it composes
 * (`lib/storage/portrait-upload.ts`).
 *
 * **This is a trust boundary, not a formatting rule.** The portrait column is
 * rendered as a plain avatar `src` on a publicly viewable sheet, so a bare
 * `z.url()` here would let an owner skip the upload action and point every
 * viewer of their sheet at an arbitrary third-party host — defeating the
 * mime/size pipeline and turning the sheet into a request beacon. Only a URL the
 * trusted upload path could have produced is admissible; a client cannot forge
 * one, because it cannot write to the store.
 *
 * The grammar lives here rather than beside the minter because the predictor
 * runs in the browser and must admit exactly what the authority admits — an
 * authority that were stricter would josse a legitimate prediction. `domain`
 * files that are neither `use-` nor `load-` may not runtime-import `lib`
 * (depcheck's purity rule), so the two ends are pinned by the correspondence
 * test in `identity.test.ts` instead of a shared import.
 */
const storedPortraitUrl = z
  .url()
  .refine(isStoredPortraitUrl, "Not a stored portrait URL")

const PORTRAIT_BLOB_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/
const PORTRAIT_BLOB_PATH =
  /^\/portraits\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/

/**
 * Whether a URL addresses a portrait this app uploaded. Deliberately total over
 * every part of the URL: anything but `https`, an unexpected host, a path outside
 * the randomized portraits namespace, or any query/fragment (a cache-buster is
 * also a tracking parameter) is refused.
 */
export function isStoredPortraitUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  return (
    url.protocol === "https:" &&
    PORTRAIT_BLOB_HOST.test(url.hostname) &&
    PORTRAIT_BLOB_PATH.test(url.pathname) &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === ""
  )
}

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
  z.object({
    field: z.literal("portraitUrl"),
    value: storedPortraitUrl.nullable(),
  }),
])

export type IdentityWrite = z.infer<typeof identityWriteSchema>

/** The identity column a write targets — the descriptor's discriminant. */
export type IdentityField = IdentityWrite["field"]
