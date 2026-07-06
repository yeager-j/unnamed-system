import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"
import { initialStateFor } from "@workspace/game-v2/mechanics"

import {
  findStepGateFailures,
  type GatedStepSlug,
} from "@/components/builder/builder-step-gates"
import type { EntityRowPatch } from "@/lib/actions/entity/version-guard"

/**
 * The pure finalize transition (UNN-556; ADR §2.8): **a validation gate + a
 * status flip**, not a storage transition. Re-runs every wizard-step gate over
 * the resolved-from-row draft, resolves the Origin through the catalog, and
 * returns the one guarded patch the action commits:
 *
 * - `status: "finalized"` — the identity-class flip;
 * - `equipment` seeded with the Origin Lineage's canonical starting weapon,
 *   equipped (PRD §5.1 step 5);
 * - `mechanics` seeded with the Origin's mechanic at its initial state (v1
 *   minted this on the archetype row; v2's Writer deliberately doesn't — the
 *   draft window rides `resolve`'s `initialStateFor` fallback);
 * - `exhaustion` at level 0 (the durable between-fights state);
 * - `talents` pruned of the Origin's own grants (v1's `setOrigin` prune,
 *   relocated here — a progression-class Writer must not patch the
 *   identity-class talents column, CH15).
 *
 * **No pool values anywhere**: depletion-native zeros already mean "full", and
 * the maxima resolve from the path formula (CH3) — the v1 finalize's
 * `currentHP = computed max` materialization has no v2 equivalent by design.
 */

export type FinalizeRefusal =
  | { kind: "missing-requirement"; stepSlug: GatedStepSlug; reason: string }
  | "no-origin-archetype"
  | "no-starting-weapon-for-lineage"

export interface FinalizeDeps {
  getArchetype(key: string): Archetype | undefined
  startingWeaponForLineage(lineage: Lineage): string | undefined
  /** Mints the seeded inventory row's id (impure at the edge, injected). */
  newId(): string
}

export function buildFinalizePatch(
  name: string,
  components: Partial<ComponentRegistry>,
  deps: FinalizeDeps
): Result<EntityRowPatch, FinalizeRefusal> {
  const failure = findStepGateFailures({ name, components })[0]
  if (failure) {
    return err({
      kind: "missing-requirement",
      stepSlug: failure.stepSlug,
      reason: failure.reason,
    })
  }

  const originKey = components.archetypes?.origin ?? null
  const archetype = originKey ? deps.getArchetype(originKey) : undefined
  if (!archetype) return err("no-origin-archetype")

  const weaponKey = deps.startingWeaponForLineage(archetype.lineage)
  if (weaponKey === undefined) return err("no-starting-weapon-for-lineage")

  const originGranted = new Set(archetype.talents)
  const mechanicState = archetype.mechanic
    ? initialStateFor(archetype.mechanic)
    : undefined

  return ok({
    status: "finalized",
    equipment: {
      items: [
        {
          id: deps.newId(),
          catalogItemKey: weaponKey,
          equipped: true,
          quantity: 1,
        },
      ],
    },
    mechanics: {
      states:
        archetype.mechanic && mechanicState
          ? { [archetype.mechanic]: mechanicState }
          : {},
    },
    exhaustion: components.exhaustion ?? { level: 0 },
    talents: (components.talents ?? []).filter(
      ({ key }) => !originGranted.has(key)
    ),
  })
}
