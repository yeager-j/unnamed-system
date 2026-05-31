"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { Prose } from "@/components/shared/prose"
import { NonOwner, OwnerOnly } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"

import { EditableDetailField } from "./editable-detail-field"

/**
 * Background block (PRD §6.1 Explore tab). Surfaces the short identity slots a
 * player writes during creation. For the owner, Pronouns / Ancestry /
 * Background are inline-editable single-line fields (UNN-224) that auto-save on
 * the identity write class; everyone else sees the read-only value. Backstory
 * is long-form prose edited in the Animus writer (Movement 3), so it stays
 * read-only here. Missing content collapses to a muted "None recorded." line so
 * the block reads the same on every character.
 */
const PRONOUNS_MAX = 64
const NARRATIVE_MAX = 160

export function Background() {
  const character = useCharacter()
  const { id: characterId } = character

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BackgroundSection label="Pronouns">
          <OwnerOnly>
            <EditableDetailField
              characterId={characterId}
              field="pronouns"
              label="Pronouns"
              serverValue={character.pronouns ?? ""}
              placeholder="e.g. they/them"
              maxLength={PRONOUNS_MAX}
            />
          </OwnerOnly>
          <NonOwner>
            <ReadOnlyValue text={character.pronouns} />
          </NonOwner>
        </BackgroundSection>

        <BackgroundSection label="Ancestry">
          <OwnerOnly>
            <EditableDetailField
              characterId={characterId}
              field="ancestry"
              label="Ancestry"
              serverValue={character.ancestryText ?? ""}
              placeholder="e.g. Half-elf, Tiefling, Dwarf…"
              maxLength={NARRATIVE_MAX}
            />
          </OwnerOnly>
          <NonOwner>
            <ReadOnlyValue text={character.ancestryText} />
          </NonOwner>
        </BackgroundSection>

        <BackgroundSection label="Background">
          <OwnerOnly>
            <EditableDetailField
              characterId={characterId}
              field="background"
              label="Background"
              serverValue={character.backgroundText ?? ""}
              placeholder="e.g. Disgraced noble, Street thief, Battlefield medic…"
              maxLength={NARRATIVE_MAX}
            />
          </OwnerOnly>
          <NonOwner>
            <ReadOnlyValue text={character.backgroundText} />
          </NonOwner>
        </BackgroundSection>

        <BackgroundSection label="Backstory">
          <ReadOnlyValue text={character.backstoryText} />
        </BackgroundSection>
      </CardContent>
    </Card>
  )
}

function BackgroundSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {children}
    </div>
  )
}

function ReadOnlyValue({ text }: { text: string | null }) {
  const isEmpty = !text || text.trim().length === 0
  return isEmpty ? (
    <p className="text-sm text-muted-foreground">None recorded.</p>
  ) : (
    <Prose>{text}</Prose>
  )
}
