import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export function Actions() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Take action
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Combat turn</DropdownMenuLabel>
          <DropdownMenuItem>
            Cast
            <DropdownMenuShortcut>C</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Defend
            <DropdownMenuShortcut>D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Inspect
            <DropdownMenuShortcut>I</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Rest</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Flee combat</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WithToggles() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Reveal options
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Overlays</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>
            Show engagement
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem>Show fog of war</DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup defaultValue="animus">
          <DropdownMenuLabel>Active movement</DropdownMenuLabel>
          <DropdownMenuRadioItem value="corpus">Corpus</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="animus">Animus</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="persona">Persona</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
