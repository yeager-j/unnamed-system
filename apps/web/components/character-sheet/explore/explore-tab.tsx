"use client"

import { useEffect, useState } from "react"

import { useCharacter } from "@/hooks/use-character"

import { Background } from "./background"
import { Identity } from "./identity"
import { JumpNav, SHEET_STICKY_OFFSET, type JumpNavItem } from "./jump-nav"
import { NarrativeSection } from "./narrative-section"
import { Notes } from "./notes"
import { Talents } from "./talents"
import { Virtues } from "./virtues"

/**
 * The Explore tab's story sections, in reading order. Each `id` is both the
 * scroll-spy key and the `<section>` anchor the {@link JumpNav} jumps to.
 */
const STORY_SECTIONS = [
  { id: "identity", label: "Identity" },
  { id: "knives", label: "Knives" },
  { id: "chains", label: "Chains" },
  { id: "background", label: "Background" },
  { id: "notes", label: "Notes" },
] as const

/**
 * Resolves the story section currently in view to drive the {@link JumpNav}
 * highlight. Probes section tops against the scroll position (offset for the
 * sticky header) and returns the last one scrolled past. Window-scroll based —
 * the document, not an inner container, is what scrolls on the sheet.
 */
function useActiveSection() {
  const [active, setActive] = useState<string>(STORY_SECTIONS[0].id)

  useEffect(() => {
    const resolve = () => {
      // A short final section can't be scrolled past the probe line, so once
      // the page bottoms out the last section wins outright.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2
      if (atBottom) {
        setActive(STORY_SECTIONS[STORY_SECTIONS.length - 1]!.id)
        return
      }

      const probe = window.scrollY + SHEET_STICKY_OFFSET + 24
      let current: string = STORY_SECTIONS[0].id
      for (const section of STORY_SECTIONS) {
        const el = document.getElementById(section.id)
        if (!el) continue
        if (el.getBoundingClientRect().top + window.scrollY <= probe) {
          current = section.id
        }
      }
      setActive(current)
    }

    resolve()
    window.addEventListener("scroll", resolve, { passive: true })
    window.addEventListener("resize", resolve, { passive: true })
    return () => {
      window.removeEventListener("scroll", resolve)
      window.removeEventListener("resize", resolve)
    }
  }, [])

  return active
}

/**
 * Explore tab root — the "Reference + Story" layout (UNN-172). A sticky
 * reference rail (Virtues, Talents, and the "On this sheet" jump nav) sits
 * beside a single reading column of narrative cards (Identity, Knives, Chains,
 * Background, Notes). Since every field here is equally important — the DM
 * mines Knives & Chains for adventure hooks — nothing is hidden behind a second
 * tab layer; the rail gives fast lookup while the story flows as one document.
 *
 * Below `lg` the rail un-sticks and stacks above the story. Owner-edit
 * affordances live inside their own sections (Virtues / Talents popovers,
 * Background inline fields); this root only composes layout and owns the
 * scroll-spy that drives the nav highlight.
 */
export function ExploreTab() {
  const character = useCharacter()
  const active = useActiveSection()

  const navItems: JumpNavItem[] = STORY_SECTIONS.map((section) => ({
    ...section,
    count:
      section.id === "knives"
        ? character.knives.length
        : section.id === "chains"
          ? character.chains.length
          : undefined,
  }))

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-[72px]">
        <section aria-label="Virtues">
          <Virtues />
        </section>
        <section aria-label="Talents">
          <Talents />
        </section>
        <JumpNav items={navItems} active={active} />
      </aside>

      <div className="flex flex-col gap-4">
        <section
          id="identity"
          aria-label="Identity"
          className="scroll-mt-[72px]"
        >
          <Identity />
        </section>
        <section id="knives" aria-label="Knives" className="scroll-mt-[72px]">
          <NarrativeSection
            title="Knives"
            accent="knife"
            entries={character.knives}
          />
        </section>
        <section id="chains" aria-label="Chains" className="scroll-mt-[72px]">
          <NarrativeSection
            title="Chains"
            accent="chain"
            entries={character.chains}
          />
        </section>
        <section
          id="background"
          aria-label="Background"
          className="scroll-mt-[72px]"
        >
          <Background />
        </section>
        <section id="notes" aria-label="Notes" className="scroll-mt-[72px]">
          <Notes />
        </section>
      </div>
    </div>
  )
}
