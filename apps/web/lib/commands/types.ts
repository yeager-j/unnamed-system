import type { useRouter } from "next/navigation"

import { type HydratedCharacter } from "@workspace/game/foundation"

import type { SheetCommandSurfaces } from "@/components/character-sheet/sheet-command-surfaces-context"
import type { SheetTabKey } from "@/components/character-sheet/sheet-tab-keys"
import type { useCharacterWrite } from "@/hooks/use-character"
import type { ViewerRole } from "@/lib/auth/viewer-role"

/**
 * The command registry for the character-sheet ⌘K palette (UNN-261, per the
 * Command Palette ADR / UNN-260). The palette is a power-user front-end over
 * the *existing* Server Actions and routes — commands never open a new write
 * path. New commands are added by appending one entry to `COMMAND_PROVIDERS`
 * in [./registry.ts](./registry.ts); no call site changes.
 */

/** The palette's visual grouping. Cast / Atlas are seeded by sibling tickets. */
export type CommandGroup = "Navigate" | "Vitals" | "Progress" | "Cast" | "Atlas"

/**
 * Everything a command's executor needs, resolved by the palette from React
 * context at the moment it opens — never captured at registration. Passing the
 * live {@link HydratedCharacter} and {@link ViewerRole} in lazily (mirroring the
 * Mechanics Registry's `MechanicEffectContext`) lets per-character providers
 * re-derive on every open with no subscription machinery.
 */
export interface CommandContext {
  character: HydratedCharacter
  role: ViewerRole
  setActiveTab: (tab: SheetTabKey) => void
  router: ReturnType<typeof useRouter>
  write: ReturnType<typeof useCharacterWrite>
  surfaces: SheetCommandSurfaces
}

/**
 * A command that prompts for a single numeric amount via a sub-page inside the
 * palette (Take damage / Heal / Spend SP). `run` fires once the amount is
 * confirmed.
 */
export interface NumberParameter {
  label: string
  placeholder?: string
  submitLabel: string
  run: (ctx: CommandContext, amount: number) => void
}

/**
 * One selectable row on a {@link Submenu} page (a Virtue to tag, an amount of
 * Victories to award, an Archetype to switch to). `run` fires on select.
 */
export interface SubmenuItem {
  id: string
  label: string
  description?: string
  keywords?: string[]
  disabled?: { reason: string }
  run: (ctx: CommandContext) => void | Promise<void>
}

/** A headed group of {@link SubmenuItem}s (e.g. one Lineage of Archetypes). */
export interface SubmenuSection {
  heading?: string
  items: SubmenuItem[]
}

/**
 * A command that, instead of running immediately, opens a child page of the
 * palette listing its own items — the idiomatic cmdk "pages" pattern (UNN-281).
 * The palette's input filters the items, so a long list (every unlocked
 * Archetype) stays searchable. `sections` is evaluated against the live
 * {@link CommandContext} on open, so the choices reflect current character state.
 */
export interface Submenu {
  placeholder?: string
  emptyLabel?: string
  sections: (ctx: CommandContext) => SubmenuSection[]
}

/**
 * One palette entry. A command carries exactly one executor: `run` for
 * immediate actions (navigation, Use Prisma), `parameter` for the amount-prompt
 * sub-page (Take damage / Heal), or `submenu` for a child page of choices
 * (Spark / Award Victory / Switch Archetype).
 *
 * Two distinct gating mechanisms, deliberately not conflated:
 *  - `requiresOwner` — **owner-gating**: the registry *omits* the command for
 *    non-owners (it never renders). Set on mutating commands.
 *  - `disabled` — **within-owner gating**: the command renders but is greyed
 *    out with a reason (e.g. 0 Prisma charges). Computed per-open by the
 *    provider from {@link CommandContext}.
 */
export interface Command {
  id: string
  label: string
  description?: string
  group: CommandGroup
  keywords?: string[]
  requiresOwner?: boolean
  disabled?: { reason: string }
  run?: (ctx: CommandContext) => void | Promise<void>
  parameter?: NumberParameter
  submenu?: Submenu
}

/**
 * A registry entry: either a constant {@link Command} (navigation) or a
 * generator evaluated against the live {@link CommandContext} (vitals, and the
 * Cast / Atlas providers added by UNN-262 / UNN-263).
 */
export type CommandProvider = Command | ((ctx: CommandContext) => Command[])
