import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import type { Resources } from "@workspace/game-v2/resources/resources.schema"

/**
 * The Prisma pool operation (D26), re-homed from v1's `adjust-pools.ts`. Unlike the
 * total HP/SP operations, this one is **partial** — the flask can be empty — so it
 * returns a {@link Result}. It returns the single changed field as a patch
 * (`Pick<Resources, "prismaUsed">`); the caller merges and re-resolves.
 */

/** Use-Prisma failure: no charges remain (the flask is empty). */
export type UsePrismaError = "no-prisma-charges"

/**
 * Use one Prisma charge: `prismaUsed + 1`, refused when no charges remain. Prisma's
 * maximum is not yet derivable (the upgrade tree is unshipped), so the resolved
 * `maxPrisma` is supplied by the caller; the operation refuses once `prismaUsed`
 * has reached it, so a tampered click can't drive the pool past empty.
 */
export function applyUsePrisma(
  resources: Resources,
  maxPrisma: number
): Result<Pick<Resources, "prismaUsed">, UsePrismaError> {
  if (resources.prismaUsed >= maxPrisma) return err("no-prisma-charges")
  return ok({ prismaUsed: resources.prismaUsed + 1 })
}
