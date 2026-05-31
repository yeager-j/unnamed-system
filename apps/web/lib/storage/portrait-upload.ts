import { put } from "@vercel/blob"

import { err, ok, type Result } from "@/lib/result"

/**
 * The set of image mime types the portrait uploader accepts. Kept narrow
 * deliberately: SVG is excluded (XSS surface in `<img src>` payloads), and
 * the four bitmap formats below are universally rendered by modern browsers.
 */
const ACCEPTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

/**
 * Hard size cap for portrait uploads. Pinned to 1 MB to match Next's default
 * Server Action `bodySizeLimit`: the portrait is sent as multipart FormData
 * through a Server Action, so a larger file is rejected by the framework
 * *before* the action runs and surfaces to the user as a cryptic "unexpected
 * response was received from the server." Validating at the same ceiling makes
 * oversized uploads fail with a clear client-side message instead. Raising this
 * (bump `serverActions.bodySizeLimit`, or move to a client-direct Blob upload)
 * is tracked in UNN-258. The client component performs the same pre-check
 * before the action is dispatched so the user gets fast feedback.
 */
export const MAX_PORTRAIT_BYTES = 1 * 1024 * 1024

export type PortraitUploadError =
  | "invalid-mime"
  | "too-large"
  | "empty-file"
  | "upload-failed"

/**
 * Validates and stores a character portrait in Vercel Blob, returning the
 * public URL. The Blob path is randomized so the uploaded file is not
 * guessable from any other character data, and so re-uploading does not
 * collide with the old object (Vercel Blob does not version paths; we want
 * stale URLs to keep working until the row pointer is overwritten).
 */
export async function uploadPortrait(
  file: File
): Promise<Result<{ url: string }, PortraitUploadError>> {
  if (file.size === 0) return err("empty-file")
  if (file.size > MAX_PORTRAIT_BYTES) return err("too-large")
  if (!ACCEPTED_MIME_TYPES.has(file.type)) return err("invalid-mime")

  const extension = extensionFor(file.type)
  const pathname = `portraits/${crypto.randomUUID()}.${extension}`

  try {
    // Pass the store-scoped token explicitly. The SDK's default resolution
    // also considers `VERCEL_OIDC_TOKEN` (a separate, repo-wide credential
    // Vercel auto-provisions for OIDC-based store access), and when both
    // are present the OIDC token can win and 403 against this store. Naming
    // the env var keeps the resolution unambiguous.
    const { url } = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return ok({ url })
  } catch (error) {
    console.error("[uploadPortrait] put() failed", error)
    return err("upload-failed")
  }
}

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    default:
      return "bin"
  }
}
