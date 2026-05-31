import {
  AxeIcon,
  CrosshairIcon,
  HandFistIcon,
  HeartIcon,
  KnifeIcon,
  MagicWandIcon,
  MusicNotesIcon,
  PawPrintIcon,
  ShieldIcon,
  SkullIcon,
  SwordIcon,
  UsersThreeIcon,
  type Icon,
} from "@phosphor-icons/react"

import type { LineageIconKey } from "./labels"

/**
 * Resolves a {@link LineageIconKey} to its Phosphor icon component. Lives apart
 * from `labels.ts` so the icon library stays out of that server-safe,
 * widely-imported module — only the (client) surfaces that actually render a
 * Lineage icon import this. The mapping is the one place the string keys meet
 * the JSX-bearing components, keeping the game/data layers icon-free.
 */
export const LINEAGE_ICONS: Record<LineageIconKey, Icon> = {
  sword: SwordIcon,
  "magic-wand": MagicWandIcon,
  fist: HandFistIcon,
  shield: ShieldIcon,
  heart: HeartIcon,
  knife: KnifeIcon,
  axe: AxeIcon,
  "music-notes": MusicNotesIcon,
  "paw-print": PawPrintIcon,
  crosshair: CrosshairIcon,
  skull: SkullIcon,
  "users-three": UsersThreeIcon,
}
