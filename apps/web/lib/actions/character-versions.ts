"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  loadCharacterVersions,
  type CharacterVersions,
} from "@/lib/db/character-versions"
import { err, ok, type Result } from "@/lib/game/result"

import {
  GetCharacterVersionsSchema,
  type GetCharacterVersionsError,
  type GetCharacterVersionsInput,
} from "./character-versions.schema"

/**
 * Read-only Server Action for the silent-retry path (UNN-203). When a write
 * wrapper returns `"stale"`, the client calls this to learn the current
 * per-write-class versions and re-dispatches the save once with the fresh
 * token for its class.
 *
 * Gated on `requireOwner` because only owners write — non-owners never need
 * a version token, and gating here matches the rest of the action surface.
 */
export async function getCharacterVersionsAction(
  input: GetCharacterVersionsInput
): Promise<Result<CharacterVersions, GetCharacterVersionsError>> {
  const parsed = GetCharacterVersionsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwner(parsed.data.characterId)

  const versions = await loadCharacterVersions(character.id)
  if (!versions) return err("character-not-found")

  return ok(versions)
}
