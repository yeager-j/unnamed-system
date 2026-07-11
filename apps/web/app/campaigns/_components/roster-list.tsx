import Link from "next/link"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { initials } from "@workspace/ui/lib/initials"

import type { RosterMember } from "@/lib/db/queries/load-campaign"
import { characterPath } from "@/lib/paths"

import { RemovePlayerButton } from "./remove-player-button"

/**
 * The campaign roster on the manage page (UNN-329): every member with their
 * placed characters, or "No character placed" when they've joined but placed
 * nothing (ADR Decision 9's two-level membership). The DM is never listed — they
 * own the campaign, they aren't a member row. Each row carries a remove control.
 */
export function RosterList({
  campaignId,
  roster,
}: {
  campaignId: string
  roster: RosterMember[]
}) {
  if (roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No players have joined yet. Share the invite link to get started.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {roster.map(({ member, characters }) => {
        const displayName = member.name ?? member.email
        return (
          <li
            key={member.id}
            className="flex items-start justify-between gap-3 border p-4"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Avatar className="size-9">
                {member.image ? (
                  <AvatarImage src={member.image} alt="" />
                ) : null}
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">{displayName}</span>
                {characters.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    No character placed
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {characters.map((character) => (
                      <Link
                        key={character.id}
                        href={characterPath(character.shortId)}
                        className="border px-2 py-0.5 text-sm transition-colors hover:bg-muted"
                      >
                        {character.name}{" "}
                        <span className="text-muted-foreground">
                          · Lv {character.level}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <RemovePlayerButton
              campaignId={campaignId}
              userId={member.id}
              playerName={displayName}
            />
          </li>
        )
      })}
    </ul>
  )
}
