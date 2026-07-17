"use client"

import Link from "next/link"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { signOutAction } from "@/lib/auth/actions"
import { stageMapsPath } from "@/lib/paths"

interface AccountMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

/**
 * Signed-in account menu in the site header. Avatar trigger opens a dropdown
 * showing the user's name + email and a sign-out item. Sign-out is wrapped in
 * a `<form action={signOutAction}>` so it dispatches a Server Action rather
 * than client-side state mutation — the action ends the database session and
 * redirects home.
 */
export function AccountMenu({ user }: AccountMenuProps) {
  const initials = initialsFor(user.name ?? user.email ?? "?")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" aria-label="Open account menu" />}
      >
        <Avatar className="size-8">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              {user.name ? (
                <span className="text-sm font-medium text-foreground">
                  {user.name}
                </span>
              ) : null}
              {user.email ? (
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              ) : null}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/" />}>
          My Characters
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/campaigns" />}>
          My Campaigns
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={stageMapsPath()} />}>
          My Maps
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem
            nativeButton
            render={<button type="submit" className="w-full text-left" />}
          >
            Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function initialsFor(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("")
}
