/**
 * Entity-page shaping (phase 6 — UNN-579): the relations list and the delete
 * confirm's ref-count copy. Pure; the reads live in
 * `lib/db/queries/load-world-web.ts`. (The per-entity timeline shaping moved
 * to `timeline.ts` when phase 7 shared it with the Chronicle and Day-End.)
 */

import {
  foldResolvedParticipants,
  type ParticipantHitsByKind,
  type ParticipantRef,
  type ResolvedParticipant,
} from "../participant"

/** One rendered outgoing relation edge. */
export interface RelationRowView {
  id: string
  label: string | null
  target: ResolvedParticipant
}

/** The relations section's slice of an edge row. */
export interface RelationRowInput {
  id: string
  label: string | null
  targetKind: ParticipantRef["kind"]
  targetId: string
}

/** Shapes an entity's outgoing edges, targets resolved (tombstones can't linger — deletes purge edges — but the fold degrades gracefully anyway). */
export function buildRelationListView(
  relations: readonly RelationRowInput[],
  hits: ParticipantHitsByKind
): RelationRowView[] {
  return relations.map((relation) => ({
    id: relation.id,
    label: relation.label,
    target: foldResolvedParticipants(
      [{ kind: relation.targetKind, id: relation.targetId }],
      hits
    )[0]!,
  }))
}

/** What still points at an entity — the delete confirm's inputs. */
export interface ParticipantRefCounts {
  relations: number
  updates: number
  beatMentions: number
}

/**
 * The delete confirm's reference sentence: "Referenced nowhere yet." when
 * clean, otherwise the non-zero parts joined — "Referenced by 2 relations
 * and 1 beat." Unit-tested copy, since it replaces phase 2's hardcoded lie.
 */
export function refCountLine(counts: ParticipantRefCounts): string {
  const parts = [
    countPart(counts.relations, "relation"),
    countPart(counts.updates, "update"),
    countPart(counts.beatMentions, "beat"),
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return "Referenced nowhere yet."
  if (parts.length === 1) return `Referenced by ${parts[0]}.`
  if (parts.length === 2) return `Referenced by ${parts[0]} and ${parts[1]}.`
  return `Referenced by ${parts[0]}, ${parts[1]}, and ${parts[2]}.`
}

function countPart(count: number, noun: string): string | null {
  if (count === 0) return null
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}
