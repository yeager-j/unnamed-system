/**
 * One participant's storage home + the durable tokens the console's write
 * accounting needs (UNN-535): a durable participant carries its character row
 * id, the `vitalsVersion` the write-router's durable arm guards on, and the
 * character `shortId` keying its realtime channel — app-transport data the
 * engine view deliberately omits. The one place the storage distinction is
 * projected for the client; downstream code receives it resolved.
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
      vitalsVersion: number
      characterShortId: string
    }
