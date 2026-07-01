import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/ui/components/command"

export function Palette() {
  return (
    <Command className="max-w-sm border border-border shadow-md">
      <CommandInput placeholder="Search actions…" />
      <CommandList>
        <CommandGroup heading="Combat">
          <CommandItem>
            Cast Spell
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Defend
            <CommandShortcut>D</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Call Showtime!
            <CommandShortcut>⇧S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Recovery">
          <CommandItem>
            Rest at camp
            <CommandShortcut>R</CommandShortcut>
          </CommandItem>
          <CommandItem>
            Inspect target
            <CommandShortcut>I</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
