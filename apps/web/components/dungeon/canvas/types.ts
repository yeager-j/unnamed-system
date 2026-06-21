import { type Pool, type ZoneLayoutView } from "@workspace/game/engine"

import { type DungeonCombatZoneNode as DungeonCombatZoneNodeType } from "@/components/dungeon/canvas/combat/zone-node"
import { type DungeonZoneNode as DungeonZoneNodeType } from "@/components/dungeon/canvas/explore/zone-node"
import { type DungeonSetupZoneToken } from "@/components/dungeon/canvas/setup/token-chip"
import { type DungeonSetupZoneNode as DungeonSetupZoneNodeType } from "@/components/dungeon/canvas/setup/zone-node"

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
 * Which board the {@link import("@/components/dungeon/canvas/canvas").DungeonCanvas} draws: **play**
 * (exploration — PC tokens from the delve roster), **combat** (the encounter
 * battlefield — combatant tokens from the shaped {@link ZoneLayoutView}), or
 * **setup** (the inclusion picker). Only one phase is mounted at a time, so the
 * canvas shell is shared and the run console swaps the mode + the matching context
 * provider + the matching bottom `bar`.
 */
export type DungeonCanvasMode =
  | { kind: "play"; roster: Record<string, DungeonRosterEntry> }
  | { kind: "combat"; layout: ZoneLayoutView }
  | { kind: "setup"; tokensByZone: Record<string, DungeonSetupZoneToken[]> }

/** The React Flow node union the canvas renders — one variant per phase. */
export type CanvasNode =
  | DungeonZoneNodeType
  | DungeonCombatZoneNodeType
  | DungeonSetupZoneNodeType
