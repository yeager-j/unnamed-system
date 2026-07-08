import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import { engagedWith } from "@workspace/game-v2/spatial/engagement-graph"

/**
 * Partitions a zone's tokens into engagement **clusters** — the connected
 * components of the same-zone melee-lock graph (engagement is symmetric, so a
 * cluster is a set of tokens reachable through each other's locks). Each token
 * appears in exactly one returned group; a Free token, or one whose only partner
 * has left the zone, comes back as a singleton, so the call site is one uniform
 * map. The zone cards ring the multi-member clusters with the dotted "engaged"
 * outline. (UNN-540 — re-homed from v1's `resolve-zone-layout.ts`.)
 *
 * Generic over any token carrying an `id` + optional `engagement` — the fog
 * view's party tokens (whose `engagement.targetCombatantIds` reference the same
 * ids these tokens key on) qualify. A token with `engagement` absent (Free, or
 * never set) contributes no edges, and any target not present in `tokens` (a
 * partner who moved away) or a self-link is dropped. Order is preserved — groups
 * appear in the order their first member appears, members keep their input order.
 */
export function groupTokensByEngagement<
  T extends { id: string; engagement?: Engagement },
>(tokens: T[]): T[][] {
  const byId = new Map(tokens.map((token) => [token.id, token]))
  const indexById = new Map(tokens.map((token, index) => [token.id, index]))
  const neighbors = (token: T): string[] =>
    (token.engagement
      ? engagedWith({ engagement: token.engagement })
      : []
    ).filter((id) => id !== token.id && byId.has(id))

  const visited = new Set<string>()
  const groups: T[][] = []

  for (const seed of tokens) {
    if (visited.has(seed.id)) continue
    const group: T[] = []
    const stack = [seed]
    visited.add(seed.id)
    while (stack.length > 0) {
      const current = stack.pop()!
      group.push(current)
      for (const id of neighbors(current)) {
        if (visited.has(id)) continue
        visited.add(id)
        stack.push(byId.get(id)!)
      }
    }
    group.sort((a, b) => indexById.get(a.id)! - indexById.get(b.id)!)
    groups.push(group)
  }

  return groups
}
