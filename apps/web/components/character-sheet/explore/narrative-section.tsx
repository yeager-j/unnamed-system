"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { Prose } from "@/components/shared/prose"
import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/schema/character"

type NarrativeEntry = CharacterKnifeRow | CharacterChainRow

/**
 * One narrative story card on the Explore tab's reading column (PRD §6.1;
 * redesigned UNN-172) — the shape both Knives and Chains share. Each entry is a
 * serif title over its free-Markdown body (rendered through {@link Prose} so a
 * player's line breaks and light Markdown survive), stacked down a left rule.
 *
 * The `accent` tints that rule: Knives — the oaths/vendettas a DM mines for
 * adventure hooks — carry the indigo "pull" accent; Chains — the relationships
 * that bind the character — stay a neutral hairline. The header shows a plain
 * entry count (there is no in-product cap on either). An empty section renders
 * a single "None recorded." line so the card reads the same shape on every
 * character.
 */
export function NarrativeSection({
  title,
  accent,
  entries,
}: {
  title: string
  accent: "knife" | "chain"
  entries: readonly NarrativeEntry[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title}
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "border-t border-l-2 border-border py-3.5 pl-3.5 first:border-t-0 first:pt-0.5",
                  accent === "knife" && "border-l-primary/50"
                )}
              >
                <p className="mb-1 font-heading text-[15px] font-medium">
                  {entry.title}
                </p>
                {entry.description ? (
                  <Prose className="prose-p:my-0">{entry.description}</Prose>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
