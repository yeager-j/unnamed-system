import { MagnifyingGlassIcon } from "@phosphor-icons/react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"

export function Search() {
  return (
    <InputGroup className="max-w-sm">
      <InputGroupAddon>
        <MagnifyingGlassIcon />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search Skills…" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton variant="default" size="sm">
          Cast
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export function WithSuffix() {
  return (
    <InputGroup className="max-w-sm">
      <InputGroupAddon>
        <InputGroupText>SP</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="0" defaultValue="24" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>/ 40</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}
