import { type Pool } from "@workspace/game/engine"

import { type DungeonZoneNode as DungeonZoneNodeType } from "@/components/dungeon/canvas/explore/zone-node"

/**
 * A party member as the DM run console's exploration board draws it — display data
 * keyed by `characterId`. The DM counterpart of the player snapshot's
 * {@link import("@workspace/game/engine").DungeonRosterEntry}; vitals are optional
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
 * Which board the {@link import("@/components/dungeon/canvas/canvas").DungeonCanvas} draws.
 * Currently only **play** (exploration — PC tokens from the delve roster); the
 * combat and setup variants were removed with the v1 combat cutover (UNN-535)
 * and return on engine v2 in PR11d. Kept an object shape so call sites are
 * stable when those variants come back.
 */
export type DungeonCanvasMode = {
  kind: "play"
  roster: Record<string, DungeonRosterEntry>
}

/** The React Flow node union the canvas renders. */
export type CanvasNode = DungeonZoneNodeType
