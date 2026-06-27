import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"

import { INSTANCE_KEYS, type EncounterInstanceComponents } from "./instance"
import { OVERLAY_KEYS, type OverlayComponents } from "./overlay"

/**
 * **Build-time structural safety for the three-home read-bag (CD14).** The loader
 * (UNN-516) assembles each participant's read surface by merging keys from three
 * physically separate homes — the durable {@link ComponentRegistry} (entity row),
 * the {@link OverlayComponents} (session blob), and the {@link EncounterInstanceComponents}
 * (occupancy token) — and the end-of-combat sweep drops every {@link OVERLAY_KEYS}
 * key. Both operations are correct **only if** the three key sets are pairwise
 * disjoint: a shared key would let the merge shadow a component, or let the sweep
 * delete a durable/instance one. This module proves that disjointness at compile
 * time, so it is a structural guarantee rather than reviewer vigilance.
 *
 * Everything here is **type-only** (erased at build): `tsc --noEmit` is the gate.
 * A future overlay/instance component whose key collides with another registry —
 * or an {@link OVERLAY_KEYS}/{@link INSTANCE_KEYS} array that drops a key — fails to
 * compile.
 */

/**
 * Resolves to `T` only when `T` is `never`; any other type violates the
 * `extends never` constraint and fails to compile. Feed it a key-set
 * intersection (or completeness gap): an empty set is `never` (ok), a non-empty
 * one surfaces the offending keys in the type error.
 */
type AssertEmpty<T extends never> = T

// --- Pairwise disjointness (the 3-way assertion) -------------------------------

type _OverlayDisjointFromComponents = AssertEmpty<
  Extract<keyof OverlayComponents, keyof ComponentRegistry>
>
type _InstanceDisjointFromComponents = AssertEmpty<
  Extract<keyof EncounterInstanceComponents, keyof ComponentRegistry>
>
type _OverlayDisjointFromInstance = AssertEmpty<
  Extract<keyof OverlayComponents, keyof EncounterInstanceComponents>
>

// --- Key-array completeness (so the sweep / projection stay total) -------------
// `as const satisfies` already proves every listed key is valid; these prove no
// key is *omitted* — the array covers the whole registry.

type _OverlayKeysComplete = AssertEmpty<
  Exclude<keyof OverlayComponents, (typeof OVERLAY_KEYS)[number]>
>
type _InstanceKeysComplete = AssertEmpty<
  Exclude<keyof EncounterInstanceComponents, (typeof INSTANCE_KEYS)[number]>
>

// Reference the alias types so `noUnusedLocals`-style lint never strips them and
// the assertions are evaluated as part of this module's type-check.
export type RegistryKeyInvariants = [
  _OverlayDisjointFromComponents,
  _InstanceDisjointFromComponents,
  _OverlayDisjointFromInstance,
  _OverlayKeysComplete,
  _InstanceKeysComplete,
]
