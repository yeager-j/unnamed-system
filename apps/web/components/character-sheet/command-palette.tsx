"use client"

import { CaretLeftIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { Input } from "@workspace/ui/components/input"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { resolveCommands } from "@/lib/commands/registry"
import type {
  CommandContext,
  CommandGroup as CommandGroupName,
  Command as PaletteCommand,
  Submenu,
  SubmenuItem,
  SubmenuSection,
} from "@/lib/commands/types"

import { useSheetCommandSurfaces } from "./sheet-command-surfaces-context"
import { useSheetNav } from "./sheet-nav-context"

/**
 * The ⌘K command palette (UNN-261, per the Command Palette ADR). A desktop-only
 * power-user accelerant: ⌘K / Ctrl-K opens it anywhere on the sheet (even inside
 * text inputs — it's a modifier chord, unlike the bare-"d" theme toggle).
 * Commands come from the lazily-enumerated registry ({@link resolveCommands}),
 * scoped to the live character + viewer role, so owner-only commands are omitted
 * for non-owners and per-character disabled state stays current. Mutating
 * commands route through the existing Server Actions via {@link useCharacterWrite}
 * — no new write path. Suppressed on touch viewports, where the existing menus
 * remain the path.
 */

const GROUP_ORDER: CommandGroupName[] = [
  "Navigate",
  "Vitals",
  "Progress",
  "Cast",
  "Atlas",
]

export function CommandPalette() {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  // The active sub-page command, if any: one carrying a `parameter` (numeric
  // form) or a `submenu` (child list). `null` is the root command list.
  const [pageCommand, setPageCommand] = useState<PaletteCommand | null>(null)

  const character = useCharacter()
  const role = useViewerRole()
  const { setActiveTab } = useSheetNav()
  const surfaces = useSheetCommandSurfaces()
  const router = useRouter()
  const write = useCharacterWrite()

  useEffect(() => {
    if (isMobile) return
    function onKeyDown(event: KeyboardEvent) {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "k"
      ) {
        return
      }
      event.preventDefault()
      // Always (re)enter at the command list — clearing here keeps a ⌘K-close
      // from leaving a stale sub-page to reopen onto.
      setPageCommand(null)
      setOpen((previous) => !previous)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isMobile])

  const ctx: CommandContext = {
    character,
    role,
    setActiveTab,
    surfaces,
    router,
    write,
  }

  const commands = resolveCommands(ctx)

  const groups = GROUP_ORDER.map((name) => ({
    name,
    commands: commands.filter((command) => command.group === name),
  })).filter((group) => group.commands.length > 0)

  if (isMobile) return null

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setPageCommand(null)
  }

  function runCommand(command: PaletteCommand) {
    if (command.disabled) return
    if (command.parameter || command.submenu) {
      setPageCommand(command)
      return
    }
    command.run?.(ctx)
    handleOpenChange(false)
  }

  function submitParameter(amount: number) {
    pageCommand?.parameter?.run(ctx, amount)
    handleOpenChange(false)
  }

  function selectSubmenuItem(item: SubmenuItem) {
    if (item.disabled) return
    item.run(ctx)
    handleOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command palette"
      description="Search for a command to run."
    >
      {pageCommand?.parameter ? (
        <ParameterPage
          parameter={pageCommand.parameter}
          onSubmit={submitParameter}
          onBack={() => setPageCommand(null)}
        />
      ) : pageCommand?.submenu ? (
        <SubmenuPage
          submenu={pageCommand.submenu}
          sections={pageCommand.submenu.sections(ctx)}
          onSelect={selectSubmenuItem}
          onBack={() => setPageCommand(null)}
        />
      ) : (
        <Command>
          <CommandInput placeholder="Type a command or search…" />
          <CommandList>
            <CommandEmpty>No commands found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.name} heading={group.name}>
                {group.commands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={command.label}
                    keywords={command.keywords}
                    disabled={Boolean(command.disabled)}
                    onSelect={() => runCommand(command)}
                  >
                    <span>{command.label}</span>
                    {command.disabled ? (
                      <span className="ml-auto text-muted-foreground">
                        {command.disabled.reason}
                      </span>
                    ) : command.description ? (
                      <span className="ml-auto text-muted-foreground">
                        {command.description}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      )}
    </CommandDialog>
  )
}

/**
 * The amount-prompt sub-page for parameterized commands (Take damage / Heal /
 * Spend SP). A positive whole number is required — the field stays invalid (and
 * the submit disabled) otherwise, mirroring the Server Action's
 * `z.number().int().positive()` schema. Back returns to the command list.
 */
function ParameterPage({
  parameter,
  onSubmit,
  onBack,
}: {
  parameter: NonNullable<PaletteCommand["parameter"]>
  onSubmit: (amount: number) => void
  onBack: () => void
}) {
  const [value, setValue] = useState("")
  const amount = Number(value)
  const valid = Number.isInteger(amount) && amount > 0

  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSubmit(amount)
      }}
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onBack}
          aria-label="Back to commands"
        >
          <CaretLeftIcon weight="bold" aria-hidden />
        </Button>
        <label htmlFor="palette-amount" className="text-sm font-medium">
          {parameter.label}
        </label>
      </div>
      <Input
        id="palette-amount"
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        placeholder={parameter.placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
      />
      <Button type="submit" disabled={!valid}>
        {parameter.submitLabel}
      </Button>
    </form>
  )
}

/**
 * A child page listing a {@link Submenu}'s items (the cmdk "pages" pattern):
 * `+1 Spark`'s Virtues, `Award Victory`'s amounts, `Switch Active Archetype`'s
 * Archetypes. The palette input filters the items so a long list stays
 * searchable; the leading Back button returns to the root command list. Items
 * render with the same label / disabled-reason / description markup as root
 * commands.
 */
function SubmenuPage({
  submenu,
  sections,
  onSelect,
  onBack,
}: {
  submenu: Submenu
  sections: SubmenuSection[]
  onSelect: (item: SubmenuItem) => void
  onBack: () => void
}) {
  return (
    <Command>
      <div className="flex items-center gap-2 px-2 pt-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onBack}
          aria-label="Back to commands"
        >
          <CaretLeftIcon weight="bold" aria-hidden />
        </Button>
      </div>
      <CommandInput placeholder={submenu.placeholder ?? "Search…"} />
      <CommandList>
        <CommandEmpty>{submenu.emptyLabel ?? "No results found."}</CommandEmpty>
        {sections.map((section, index) => (
          <CommandGroup
            key={section.heading ?? index}
            heading={section.heading}
          >
            {section.items.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                keywords={item.keywords}
                disabled={Boolean(item.disabled)}
                onSelect={() => onSelect(item)}
              >
                <span>{item.label}</span>
                {item.disabled ? (
                  <span className="ml-auto text-muted-foreground">
                    {item.disabled.reason}
                  </span>
                ) : item.description ? (
                  <span className="ml-auto text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}
