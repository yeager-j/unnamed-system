import { FlaskIcon, SwordIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

export function Default() {
  return (
    <Item variant="outline" className="max-w-md">
      <ItemMedia variant="icon">
        <SwordIcon weight="fill" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Ceremonial Rapier</ItemTitle>
        <ItemDescription>
          +2 Corpus reach · deals Slash damage on a Follow-Up.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="sm">
          Equip
        </Button>
      </ItemActions>
    </Item>
  )
}

export function Group() {
  return (
    <ItemGroup className="max-w-md">
      <Item variant="muted">
        <ItemMedia variant="icon">
          <SwordIcon weight="fill" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Ceremonial Rapier</ItemTitle>
          <ItemDescription>Equipped · main hand</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">
            Swap
          </Button>
        </ItemActions>
      </Item>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <FlaskIcon weight="fill" />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Soul Drop ×3</ItemTitle>
          <ItemDescription>Restores 20 SP on use.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button variant="ghost" size="sm">
            Use
          </Button>
        </ItemActions>
      </Item>
    </ItemGroup>
  )
}
