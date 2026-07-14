import { type Components } from "react-markdown"

import { ParticipantPreviewPill } from "@/components/shared/participant-preview"
import { Prose } from "@/components/shared/prose"
import { CHIP_TOKEN_SOURCE, EMBED_TOKEN_SOURCE } from "@/domain/planner/chip"
import type {
  ParticipantKind,
  ResolvedParticipant,
} from "@/domain/planner/participant"

import { EmbedCard } from "./embed-card"
import { parseEmbedLine } from "./embed-kinds"

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
 *
 * Embed tokens `![[kind:id|label]]` (UNN-624) rewrite **first**, and the
 * ordering is load-bearing: the chip rewrite alone would turn `![[…]]` into
 * `![label](#chip:…)` — a broken markdown image. A whole-line token of an
 * embeddable kind becomes `![label](#embed:kind:id)` (native image syntax)
 * and the `img` claim renders the block card; any other embed token gets its
 * bang backslash-escaped so it degrades to a literal `!` + the inline pill.
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
      const separator = key.indexOf(":")
      const kind = key.slice(0, separator) as ParticipantKind
      const id = key.slice(separator + 1)
      const captured = typeof linkChildren === "string" ? linkChildren : ""
      return (
        <ParticipantPreviewPill
          kind={kind}
          id={id}
          label={resolved?.label ?? captured}
          tombstoned={resolved?.tombstoned ?? false}
          className="not-prose"
        />
      )
    },
    img: ({ src, alt, ...rest }) => {
      const source = typeof src === "string" ? src : ""
      if (!source.startsWith(EMBED_HREF_PREFIX)) {
        return <img src={src} alt={alt} {...rest} />
      }
      const key = source.slice(EMBED_HREF_PREFIX.length)
      const resolved = byRef.get(key)
      const separator = key.indexOf(":")
      const kind = key.slice(0, separator) as ParticipantKind
      const id = key.slice(separator + 1)
      return (
        <EmbedCard kind={kind} id={id} label={resolved?.label ?? alt ?? ""} />
      )
    },
    p: ({ node, children: paragraphChildren, ...rest }) => {
      const only = node?.children.length === 1 ? node.children[0] : undefined
      const isEmbedOnly =
        only !== undefined &&
        only.type === "element" &&
        only.tagName === "img" &&
        String(only.properties?.src ?? "").startsWith(EMBED_HREF_PREFIX)
      if (isEmbedOnly) return <>{paragraphChildren}</>
      return <p {...rest}>{paragraphChildren}</p>
    },
  }
  return (
    <Prose className={className} components={components}>
      {chipTokensToLinks(embedTokensToImages(children))}
    </Prose>
  )
}

const CHIP_HREF_PREFIX = "#chip:"
const EMBED_HREF_PREFIX = "#embed:"

/** Rewrites every chip token into the fragment link the component map claims. */
function chipTokensToLinks(markdown: string): string {
  return markdown.replaceAll(
    new RegExp(CHIP_TOKEN_SOURCE, "g"),
    (_token, kind: string, id: string, label: string) =>
      `[${label.trim() === "" ? "Unknown" : label}](${CHIP_HREF_PREFIX}${kind}:${id})`
  )
}

/**
 * Rewrites embed tokens ahead of the chip rewrite: a whole-line token of an
 * embeddable kind becomes native image syntax the `img` claim turns into the
 * block card; every other embed token has its bang escaped (`\!`) so the chip
 * rewrite yields a literal `!` + pill instead of accidental image syntax.
 */
function embedTokensToImages(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      const ref = parseEmbedLine(line)
      if (ref !== null) {
        const label = ref.label?.trim() ? ref.label : "Unknown"
        return `![${label}](${EMBED_HREF_PREFIX}${ref.kind}:${ref.id})`
      }
      return line.replaceAll(
        new RegExp(EMBED_TOKEN_SOURCE, "g"),
        (token) => `\\${token}`
      )
    })
    .join("\n")
}
