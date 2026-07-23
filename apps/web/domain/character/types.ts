import type { PlayerCharacterStatus } from "@/lib/db/schema/player-character"

/**
 * App-owned character fields carried alongside the character's entity
 * substrate in the client aggregate.
 */
export interface CharacterProfile {
  id: string
  shortId: string
  ownerId: string
  campaignId: string | null
  status: PlayerCharacterStatus
  builderStep: number
  name: string
  portraitUrl: string | null
  pronouns: string | null
  notes: string | null
}
