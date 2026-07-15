import { type DungeonCombatZoneNode as DungeonCombatZoneNodeType } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/zone-node"
import { type DungeonZoneNode as DungeonZoneNodeType } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node"
import { type RosterView } from "@/domain/combat/view/roster-view"
import { type Pool } from "@/domain/pool"

/**
 * A party member as the DM run console's exploration board draws it — display data
 * keyed by `characterId`. The DM counterpart of the player snapshot's
 * {@link import("@workspace/game-v2/visibility").DungeonRosterEntry}; vitals are optional
 * here because the DM board fills them from the hydrated party (absent ⇒ no bars),
 * whereas the redacted player snapshot always carries them.
 */
export interface DungeonRosterEntry {
  name: string
  portraitUrl: string | null
  /** Current/max vitals for the token's health bars (UNN-489). Optional — the DM
   *  exploration board fills them from the hydrated party; absent ⇒ no bars. */
  hp?: Pool
  sp?: Pool
}

/**
 * Which board the {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").DungeonCanvas}
 * draws — **play** (exploration, PC tokens from the delve roster) or **combat**
 * (the live battlefield, tokens grouped from the v2 console {@link RosterView} by
 * their occupancy zone; UNN-536). The setup variant returns with a later spatial
 * ticket. `buildNodes` keys off `kind` to pick the node builder.
 */
export type DungeonCanvasMode =
  | { kind: "play"; roster: Record<string, DungeonRosterEntry> }
  | { kind: "combat"; roster: RosterView }

/** The React Flow node union the canvas renders. */
export type CanvasNode = DungeonZoneNodeType | DungeonCombatZoneNodeType
