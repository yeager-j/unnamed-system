"use client"

import { type ReactNode } from "react"

import { useCharacter } from "@/hooks/use-character"

import { Background } from "./background"
import { Identity } from "./identity"
import { NarrativeSection } from "./narrative-section"
import { Notes } from "./notes"

/**
 * The Explore tab's story sections, in reading order. Each `id` is both the
 * scroll-spy key and the `<section>` anchor the {@link import("./jump-nav").JumpNav}
 * jumps to — prefixed so these generic words can't collide with a co-mounted
 * surface's element ids.
 */
export const STORY_SECTIONS = [
  { id: "explore-identity", label: "Identity" },
  { id: "explore-knives", label: "Knives" },
  { id: "explore-chains", label: "Chains" },
  { id: "explore-background", label: "Background" },
  { id: "explore-notes", label: "Notes" },
] as const

/**
 * The Explore tab's reading column: the ordered narrative `<section>`s
 * (Identity, Knives, Chains, Background, Notes), each anchored by its
 * {@link STORY_SECTIONS} id. Pure layout over `useCharacter()` — no rail, no
 * scroll-spy, no jump-nav (those are window-scroll bound and belong to the
 * full-page {@link import("./explore-tab").ExploreTab}). Shared so a side-panel
 * surface — the dungeon non-combat player view — can render the same story
 * stacked, without the page chrome.
 */
export function ExploreSections() {
  const character = useCharacter()

  const bodies: Record<string, ReactNode> = {
    "explore-identity": <Identity />,
    "explore-knives": (
      <NarrativeSection
        title="Knives"
        accent="knife"
        entries={character.knives}
      />
    ),
    "explore-chains": (
      <NarrativeSection
        title="Chains"
        accent="chain"
        entries={character.chains}
      />
    ),
    "explore-background": <Background />,
    "explore-notes": <Notes />,
  }

  return (
    <>
      {STORY_SECTIONS.map(({ id, label }) => (
        <section
          key={id}
          id={id}
          aria-label={label}
          className="scroll-mt-[var(--sheet-sticky-offset)]"
        >
          {bodies[id]}
        </section>
      ))}
    </>
  )
}
