/**
 * One participant's storage home for display-only console decisions. Mutation
 * admission resolves this locator again from authoritative encounter storage;
 * no version, public id, or client storage claim participates in a write.
 *
 * Homed in `domain/combat` (not the encounter route loader that builds it) so
 * the combat view builders + write plumbing that consume it never reach up into
 * the `app/` tier.
 */
export type ParticipantMeta =
  | { storage: "inline" }
  | {
      storage: "durable"
      characterId: string
    }
