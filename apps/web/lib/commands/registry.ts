import { navigationCommands } from "./navigation"
import type { Command, CommandContext, CommandProvider } from "./types"
import { vitalsCommands } from "./vitals"

/**
 * The command palette's single source of truth (UNN-261). Each entry is a
 * {@link CommandProvider}: a constant {@link Command} or a generator evaluated
 * against the live {@link CommandContext}. Adding a command — or a whole batch,
 * as UNN-262 (Cast) and UNN-263 (Atlas) will — means appending one entry here;
 * no call site in the palette changes.
 */
const COMMAND_PROVIDERS: CommandProvider[] = [
  ...navigationCommands,
  vitalsCommands,
]

/**
 * Flattens every provider against `ctx`, then applies **owner-gating**:
 * `requiresOwner` commands are omitted entirely for non-owners (per the ADR —
 * omitted, not shown-disabled). Within-owner `disabled` state is left intact
 * for the palette to render. Re-run on every open so per-character providers
 * reflect current state.
 */
export function resolveCommands(ctx: CommandContext): Command[] {
  const isOwner = ctx.role === "owner"
  return COMMAND_PROVIDERS.flatMap((provider) =>
    typeof provider === "function" ? provider(ctx) : [provider]
  ).filter((command) => isOwner || !command.requiresOwner)
}
