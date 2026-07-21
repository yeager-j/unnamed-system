import type { IdentityWrite } from "./identity.schema"

/**
 * The identity-column patch algebra (Headcanon P2c — UNN-675) — the app-column
 * species' peer of {@link import("./merge-patch").mergeComponentPatch}, and the
 * **one** place a descriptor field becomes a stored column value.
 *
 * Both sides of the protocol run it: the `entity.identity` predictor folds it over
 * the mounted canon, and the authority spreads it into the guarded UPDATE. So the
 * canonicalizations below — a cleared optional column stores `null`, never `""` —
 * are applied identically to the prediction and to the row, and a settled edit
 * canonizes to exactly what was predicted rather than drifting by an empty string.
 *
 * Same patch contract as the component species: keys are 1:1 with `entity`
 * columns, so the result is structurally an
 * {@link import("@/lib/actions/entity/version-guard").EntityColumnPatch} and a
 * `SET` of it cannot touch a sibling class's column.
 */

/** The identity-axis columns a character surface renders and writes — the
 *  app-owned half of the character canon's value. */
export interface EntityIdentity {
  name: string
  pronouns: string | null
  portraitUrl: string | null
  notes: string | null
}

/** Exactly the column one identity write sets. */
export type EntityIdentityPatch = Partial<EntityIdentity>

export function identityWritePatch(write: IdentityWrite): EntityIdentityPatch {
  switch (write.field) {
    case "name":
      // Already trimmed and length-checked by the descriptor's parser.
      return { name: write.value }
    case "pronouns":
      return { pronouns: write.value?.trim() || null }
    case "notes":
      return { notes: write.value === "" ? null : write.value }
    case "portraitUrl":
      return { portraitUrl: write.value }
  }
}

/** The predictor's fold: the identity slice with one column replaced. */
export function applyIdentityWrite(
  identity: EntityIdentity,
  write: IdentityWrite
): EntityIdentity {
  return { ...identity, ...identityWritePatch(write) }
}
