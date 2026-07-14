/**
 * The participant-ref vocabulary (tech-design D4): the two-column soft ref
 * `(kind, id)` every timeline/beat/relation surface uses to point at a world
 * thing. Extensible by value — a new kind is a new string, never a schema
 * change — so refs carry **no DB FKs**; the compensating invariants are the
 * campaign-scoped resolver (`domain/planner/load-participants.ts`) and the
 * write-boundary validation (`lib/db/queries/load-participants.ts`).
 */
export const PARTICIPANT_KINDS = [
  "article",
  "npc",
  "character",
  "encounter",
  "dungeon",
] as const

/**
 * What a participant ref points at. `character` and `npc` ids are entity ids;
 * `encounter` and `dungeon` ids are their table UUIDs (the URL shortId travels
 * separately as the shared `shortId` field on linker/preview shapes).
 */
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number]

/**
 * A soft reference to a participant. `label` is the readable fallback captured
 * at insert time (the D7 chip label) — the id stays authoritative; render
 * resolves the current name, and the label only surfaces on a lookup miss.
 */
export interface ParticipantRef {
  kind: ParticipantKind
  id: string
  label?: string
}

/** One lookup hit for a ref: the current name + the tombstone stamp (D4). */
export interface ParticipantHit {
  name: string
  deletedAt: Date | null
}

/** Campaign-scoped lookup results, keyed by kind then id. */
export type ParticipantHitsByKind = Readonly<
  Record<ParticipantKind, ReadonlyMap<string, ParticipantHit>>
>

/**
 * A ref resolved for rendering. `tombstoned` refs render muted (history
 * survives its subjects — D4); `missing` refs (an FK-less lookup miss, or a
 * cross-campaign id the scoped lookup refused) fall back to the captured
 * label — defense in depth, never a page break.
 */
export interface ResolvedParticipant {
  ref: ParticipantRef
  label: string
  tombstoned: boolean
  missing: boolean
}

/** The last-resort label for a ref that resolved to nothing and captured none. */
export function fallbackParticipantLabel(kind: ParticipantKind): string {
  switch (kind) {
    case "article":
      return "Unknown article"
    case "npc":
      return "Unknown NPC"
    case "character":
      return "Unknown character"
    case "encounter":
      return "Unknown encounter"
    case "dungeon":
      return "Unknown dungeon"
  }
}

/**
 * Folds refs over campaign-scoped lookup hits into render-ready participants
 * (D4). Pure — the DB read lives in `lib/db/queries/load-participants.ts`;
 * `resolveParticipants` composes the two.
 */
export function foldResolvedParticipants(
  refs: readonly ParticipantRef[],
  hits: ParticipantHitsByKind
): ResolvedParticipant[] {
  return refs.map((ref) => {
    const hit = hits[ref.kind].get(ref.id)
    if (hit === undefined) {
      return {
        ref,
        label: ref.label ?? fallbackParticipantLabel(ref.kind),
        tombstoned: false,
        missing: true,
      }
    }
    return {
      ref,
      label: hit.name,
      tombstoned: hit.deletedAt !== null,
      missing: false,
    }
  })
}
