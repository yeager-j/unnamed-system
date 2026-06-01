"use client"

import { CaretLeftIcon } from "@phosphor-icons/react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

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
} from "@/lib/commands/types"

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

const GROUP_ORDER: CommandGroupName[] = ["Navigate", "Vitals", "Cast", "Atlas"]

export function CommandPalette() {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [parameterCommand, setParameterCommand] =
    useState<PaletteCommand | null>(null)

  const character = useCharacter()
  const role = useViewerRole()
  const { setActiveTab } = useSheetNav()
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
      setOpen((previous) => !previous)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isMobile])

  const ctx: CommandContext = useMemo(
    () => ({ character, role, setActiveTab, router, write }),
    [character, role, setActiveTab, router, write]
  )

  const commands = useMemo(() => resolveCommands(ctx), [ctx])

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((name) => ({
        name,
        commands: commands.filter((command) => command.group === name),
      })).filter((group) => group.commands.length > 0),
    [commands]
  )

  if (isMobile) return null

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setParameterCommand(null)
  }

  function runCommand(command: PaletteCommand) {
    if (command.disabled) return
    if (command.parameter) {
      setParameterCommand(command)
      return
    }
    command.run?.(ctx)
    handleOpenChange(false)
  }

  function submitParameter(amount: number) {
    parameterCommand?.parameter?.run(ctx, amount)
    handleOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command palette"
      description="Search for a command to run."
    >
      {parameterCommand?.parameter ? (
        <ParameterPage
          parameter={parameterCommand.parameter}
          onSubmit={submitParameter}
          onBack={() => setParameterCommand(null)}
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
