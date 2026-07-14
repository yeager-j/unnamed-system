import {
  CastleTurretIcon,
  FlagBannerIcon,
  HouseLineIcon,
  MaskHappyIcon,
  ScrollIcon,
  SwordIcon,
  UserIcon,
  type Icon,
} from "@phosphor-icons/react"

import type { LinkerIconKey } from "@/domain/planner/view/linker"

/**
 * Resolves a participant/linker icon key to its Phosphor component — the one
 * place the world-web's string keys meet JSX-bearing icons (the
 * `lineage-icons.ts` pattern). Shared by the participant linker's rows, the
 * editor's chip pills, and the suggestion popover; a bare `ParticipantKind`
 * indexes it too, since kinds are a subset of {@link LinkerIconKey}.
 */
export const PARTICIPANT_KIND_ICONS: Record<LinkerIconKey, Icon> = {
  npc: MaskHappyIcon,
  character: UserIcon,
  article: ScrollIcon,
  settlement: HouseLineIcon,
  faction: FlagBannerIcon,
  encounter: SwordIcon,
  dungeon: CastleTurretIcon,
}
