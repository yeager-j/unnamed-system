"use server"

import { err, type Result } from "@workspace/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import {
  uploadPortrait,
  type PortraitUploadError,
} from "@/lib/storage/portrait-upload"

/**
 * Stage one of a portrait change (UNN-675): gate on the strict owner, validate and
 * store the file in Vercel Blob, and return the public URL. It writes **no
 * database row** — the caller commits the URL through the `entity.identity`
 * mutation, which is what puts the write on the identity axis.
 *
 * The split is forced, not stylistic. A Headcanon authority handler must be
 * rerunnable: a lost guarded write reruns it against fresh state, so it may
 * produce no effect outside its transaction before terminal acceptance
 * (invariant 16). A Blob write inside the handler would upload the same image
 * twice on a contention retry. Uploading first, committing second, keeps the
 * non-transactional effect where a rerun cannot repeat it.
 *
 * The residual cost is an orphaned Blob when stage two fails — the same exposure
 * the single-action version already had when its guarded update lost, and the
 * reason the Blob path is randomized so a re-upload never collides.
 */
export async function uploadEntityPortraitAction(
  formData: FormData
): Promise<Result<{ url: string }, PortraitUploadError | "invalid-input">> {
  const entityId = formData.get("entityId")
  const file = formData.get("file")

  if (typeof entityId !== "string" || !(file instanceof File)) {
    return err("invalid-input")
  }

  await requireEntityOwner(entityId)

  return uploadPortrait(file)
}
