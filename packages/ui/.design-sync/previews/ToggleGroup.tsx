import {
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
} from "@phosphor-icons/react"

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

export function SingleSelect() {
  return (
    <ToggleGroup defaultValue={["animus"]}>
      <ToggleGroupItem value="corpus">Corpus</ToggleGroupItem>
      <ToggleGroupItem value="ortus">Ortus</ToggleGroupItem>
      <ToggleGroupItem value="animus">Animus</ToggleGroupItem>
      <ToggleGroupItem value="persona">Persona</ToggleGroupItem>
    </ToggleGroup>
  )
}

export function MultiSelect() {
  return (
    <ToggleGroup toggleMultiple defaultValue={["fire", "ice"]}>
      <ToggleGroupItem value="fire">Fire</ToggleGroupItem>
      <ToggleGroupItem value="ice">Ice</ToggleGroupItem>
      <ToggleGroupItem value="wind">Wind</ToggleGroupItem>
      <ToggleGroupItem value="light">Light</ToggleGroupItem>
    </ToggleGroup>
  )
}

export function Outline() {
  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      defaultValue={["center"]}
      className="w-fit"
    >
      <ToggleGroupItem value="left">
        <TextAlignLeft />
      </ToggleGroupItem>
      <ToggleGroupItem value="center">
        <TextAlignCenter />
      </ToggleGroupItem>
      <ToggleGroupItem value="right">
        <TextAlignRight />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
