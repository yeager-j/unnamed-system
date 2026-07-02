import type { WriterDeps } from "@/lib/combat/commit/writers"

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
 * - `usePrisma` — only when the resolved cap is known (`deps.maxPrisma`), which
 *   under the interim rule is **never** (the v2 upgrade tree hasn't shipped a
 *   resolvable max; the session arm refuses `no-prisma-max`), so no Prisma
 *   button renders anywhere yet.
 */
export interface VitalsAffordances {
  setMax: boolean
  usePrisma: boolean
}

export function vitalsAffordances(
  isPc: boolean,
  deps: WriterDeps
): VitalsAffordances {
  return {
    setMax: !isPc,
    usePrisma: deps.maxPrisma !== undefined,
  }
}
