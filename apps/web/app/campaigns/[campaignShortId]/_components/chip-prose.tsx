import { type Components } from "react-markdown"

import { ParticipantPill } from "@/components/shared/participant-pill"
import { Prose } from "@/components/shared/prose"
import { CHIP_TOKEN_SOURCE } from "@/domain/planner/chip"
import type {
  ParticipantKind,
  ResolvedParticipant,
} from "@/domain/planner/participant"

/**
 * The **read-only chip-prose renderer** (tech-design D7): markdown bodies
 * carrying `[[kind:id|label]]` tokens, rendered through the house `Prose`
 * pipeline with each chip as a participant pill showing the **current**
 * resolved name (renames propagate, tombstones mute — the captured label is
 * only the fallback for a ref the resolver never saw). First mounted by the
 * runner's beat card; phases 6–7's entity pages and Chronicle reuse it.
 *
 * Mechanically: each token is rewritten to a `#chip:kind:id` fragment link
 * *before* parsing — inline tokens survive any markdown context that allows
 * links — and the component map claims those links back into pills after
 * sanitize. Ids are UUIDs and labels are grammar-sanitized (D7), so the
 * rewrite can't be broken out of; a token inside a code span stays literal
 * text, which is what a code span promises anyway.
 */
export function ChipProse({
  children,
  participants,
  className,
}: {
  /** Markdown body, chip tokens included. */
  children: string
  /** Resolver output for the body's refs (the page already loads these). */
  participants: readonly ResolvedParticipant[]
  className?: string
}) {
  const byRef = new Map(
    participants.map((participant) => [
      `${participant.ref.kind}:${participant.ref.id}`,
      participant,
    ])
  )
  const components: Components = {
    a: ({ href, children: linkChildren, ...rest }) => {
      if (!href?.startsWith(CHIP_HREF_PREFIX)) {
        return (
          <a href={href} {...rest}>
            {linkChildren}
          </a>
        )
      }
      const key = href.slice(CHIP_HREF_PREFIX.length)
      const resolved = byRef.get(key)
      const kind = key.slice(0, key.indexOf(":")) as ParticipantKind
      const captured = typeof linkChildren === "string" ? linkChildren : ""
      return (
        <ParticipantPill
          kind={kind}
          label={resolved?.label ?? captured}
          tombstoned={resolved?.tombstoned ?? false}
          className="not-prose"
        />
      )
    },
  }
  return (
    <Prose className={className} components={components}>
      {chipTokensToLinks(children)}
    </Prose>
  )
}

const CHIP_HREF_PREFIX = "#chip:"

/** Rewrites every chip token into the fragment link the component map claims. */
function chipTokensToLinks(markdown: string): string {
  return markdown.replaceAll(
    new RegExp(CHIP_TOKEN_SOURCE, "g"),
    (_token, kind: string, id: string, label: string) =>
      `[${label.trim() === "" ? "Unknown" : label}](${CHIP_HREF_PREFIX}${kind}:${id})`
  )
}
