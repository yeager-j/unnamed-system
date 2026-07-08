import type { ViewerRole } from "@/lib/auth/viewer-role"
import type { LoadedCharacter } from "@/lib/character/load"

/**
 * The sheet's app-level read boundary for private narrative fields (UNN-558;
 * rulebook 1.5 — Secrets are shared with the DM in private). The v2 combat
 * policy table can't serve here by design: its verdict is whole-component and
 * binary (CD11), and it drops `narrative` wholesale — its own docblock assigns
 * owner/public gating of Secrets to the sheet. This is the sheet-side
 * analogue of the same discipline: decided once at the route boundary (where
 * the role is minted), applied as a pure transform over the loaded triple, so
 * a non-owner's RSC payload never carries the field — `OwnerOnly` in the UI
 * stays affordance-only, as documented.
 *
 * Redacts BOTH homes carrying narrative (`entity.components` authored,
 * `resolved.components` pass-through) and never mutates — the loader is
 * React-cached, so the owner's `generateMetadata` read shares the object.
 */
export function redactLoadedCharacterForViewer(
  loaded: LoadedCharacter,
  role: ViewerRole
): LoadedCharacter {
  if (role === "owner") return loaded

  return {
    ...loaded,
    entity: {
      ...loaded.entity,
      components: withoutSecrets(loaded.entity.components),
    },
    resolved: {
      ...loaded.resolved,
      components: withoutSecrets(loaded.resolved.components),
    },
  }
}

function withoutSecrets<
  T extends { narrative?: { secrets: string | null } | undefined },
>(components: T): T {
  if (!components.narrative) return components
  return {
    ...components,
    narrative: { ...components.narrative, secrets: null },
  }
}
