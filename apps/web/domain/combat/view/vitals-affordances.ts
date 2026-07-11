import type { DisplayHome } from "@/domain/combat/view/display-home"

/**
 * The drawer's vitals **affordance gates** (UNN-535) — a pure predicate the
 * vitals section renders from, so "which buttons exist" is unit-testable
 * without a component harness. Damage/heal render for **both** storage homes
 * whenever the pool resolved (the deliberate UNN-482 supersession: durable PC
 * vitals are writable again through the CD19 write-router); the two gated
 * affordances are:
 *
 * - `setMax` — **inline-only**: a durable participant's max derives from the
 *   engine (`entityRowStore` refuses `setMax` with `unsupported-durable-write`),
 *   so the control must not render for a PC.
 * - `usePrisma` — only when the participant resolved a Prisma pool (it carries
 *   a `resources` component; the cap resolves from the engine's base constant
 *   since S2a). Enemies without a flask never show the button.
 */
export interface VitalsAffordances {
  setMax: boolean
  usePrisma: boolean
}

export function vitalsAffordances(
  home: DisplayHome,
  hasPrisma: boolean
): VitalsAffordances {
  return {
    setMax: home === "enemy",
    usePrisma: hasPrisma,
  }
}
