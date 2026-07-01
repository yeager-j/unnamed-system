import { Button } from "@workspace/ui/components/button"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@workspace/ui/components/button-group"

export function TurnActions() {
  return (
    <ButtonGroup>
      <Button variant="outline">Cast Spell</Button>
      <Button variant="outline">Defend</Button>
      <Button variant="outline">Move</Button>
      <Button variant="outline">End Turn</Button>
    </ButtonGroup>
  )
}

export function WithSeparator() {
  return (
    <ButtonGroup>
      <Button variant="outline">Rest</Button>
      <ButtonGroupSeparator />
      <Button variant="outline">Showtime!</Button>
    </ButtonGroup>
  )
}

export function WithLabel() {
  return (
    <ButtonGroup>
      <ButtonGroupText>SP Cost</ButtonGroupText>
      <Button variant="outline">−</Button>
      <Button variant="outline">3</Button>
      <Button variant="outline">+</Button>
    </ButtonGroup>
  )
}

export function Vertical() {
  return (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Corpus</Button>
      <Button variant="outline">Ortus</Button>
      <Button variant="outline">Animus</Button>
    </ButtonGroup>
  )
}
