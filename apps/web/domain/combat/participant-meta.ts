/**
 * One participant's storage home + the durable addressing the console's write
 * plumbing needs (UNN-535; slimmed in UNN-646): a durable participant carries
 * its character row id (the replica's authority address) and the character
 * `shortId` keying its realtime channel — app-transport data the engine view
 * deliberately omits. The `vitalsVersion` token the classic per-PC queues
 * guarded on retired with them: the replica's accepted snapshots carry their
 * own cursors.
 *
 * The one place the storage distinction is projected for the client;
 * downstream code receives it resolved (`useCombatReplicas` is the sole
 * consumer of `storage`).
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
      characterShortId: string
    }
