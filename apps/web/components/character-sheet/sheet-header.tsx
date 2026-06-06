"use client"

import { archetypeDisplayName } from "@workspace/game/data"
import { VICTORIES_PER_LEVEL } from "@workspace/game/engine"
import { isFallen } from "@workspace/game/foundation"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"

import { NonOwner, OwnerOnly } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"
import { initials } from "@/lib/ui/initials"
import { PATH_CHOICE_LABELS } from "@/lib/ui/labels"

import { ActiveArchetypeSwitcher } from "./active-archetype-switcher"
import { Attributes } from "./attributes"
import { EditableCharacterName } from "./editable-character-name"
import { EditablePortrait } from "./editable-portrait"
import { HeaderOwnerActions } from "./header-owner-actions"
import { OwnerControlsSlot } from "./owner-controls-slot"
import { Vitals } from "./vitals"

/**
 * The read-only top-of-sheet summary, persistent above the tabs (PRD §6.1
 * Header): identity (portrait, name, pronouns, `Level · Archetype · Victories
 * x/7`, currency) on the left, and a glance block on the right with
 * {@link Vitals} (HP/SP) above {@link Attributes}. Side by side on wide screens,
 * stacked on narrow ones. Attributes and Victories ride here, not in a tab,
 * because they matter in every encounter context — Victories is progress
 * toward the next level, shown read-only (the award/level-up controls are a
 * separate owner-mode ticket). A `Fallen` badge surfaces when current HP has
 * reached 0. No controls inline; the owner-mode actions affordance lives in
 * an empty {@link OwnerControlsSlot} placeholder wrapped in {@link OwnerOnly},
 * so it only renders when the surrounding {@link ViewerRoleProvider} reports
 * the viewer is the owner. Subsequent tickets drop their controls into the
 * slot without restructuring this layout (PRD §6.1).
 */
export function SheetHeader() {
  const character = useCharacter()
  const fallen = isFallen(character.currentHP)

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="flex flex-col gap-4 md:flex-1">
          <div className="flex items-start gap-4">
            <OwnerOnly>
              <EditablePortrait />
            </OwnerOnly>
            <NonOwner>
              <Avatar className="size-20 rounded-none">
                <AvatarImage
                  src={character.portraitUrl ?? undefined}
                  alt={`${character.name}'s portrait`}
                  className="rounded-none"
                />
                <AvatarFallback className="rounded-none text-lg">
                  {initials(character.name)}
                </AvatarFallback>
              </Avatar>
            </NonOwner>

            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <OwnerOnly>
                  <EditableCharacterName
                    characterId={character.id}
                    name={character.name}
                  />
                </OwnerOnly>
                <NonOwner>
                  <h1 className="font-heading text-2xl font-semibold">
                    {character.name}
                  </h1>
                </NonOwner>
                {fallen ? <Badge variant="destructive">Fallen</Badge> : null}
              </div>

              <p className="text-sm text-muted-foreground">
                Level {character.level} ·{" "}
                <OwnerOnly>
                  <ActiveArchetypeSwitcher />
                </OwnerOnly>
                <NonOwner>
                  {archetypeDisplayName(character.activeArchetypeKey)}
                </NonOwner>{" "}
                · {PATH_CHOICE_LABELS[character.pathChoice]}
              </p>

              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {character.victories}/{VICTORIES_PER_LEVEL}
                </span>{" "}
                Victories
              </p>
            </div>
          </div>

          <OwnerOnly>
            <div className="mt-auto">
              <OwnerControlsSlot>
                <HeaderOwnerActions />
              </OwnerControlsSlot>
            </div>
          </OwnerOnly>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6 md:w-80 md:border-t-0 md:border-l md:pt-0 md:pl-6">
          <Vitals />
          <section aria-label="Attributes">
            <Attributes />
          </section>
        </div>
      </CardContent>
    </Card>
  )
}
