import { CrownIcon } from "@phosphor-icons/react"

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@workspace/ui/components/avatar"

export function Single() {
  return (
    <Avatar size="lg">
      <AvatarFallback>VN</AvatarFallback>
      <AvatarBadge>
        <CrownIcon weight="fill" />
      </AvatarBadge>
    </Avatar>
  )
}

export function Group() {
  return (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback>VN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>KO</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>RS</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  )
}
