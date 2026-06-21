"use client"

import { useEffect, useState, type CSSProperties } from "react"

import { useCharacter } from "@/hooks/use-character"

import { ExploreSections, STORY_SECTIONS } from "./explore-sections"
import { JumpNav, SHEET_STICKY_OFFSET, type JumpNavItem } from "./jump-nav"
import { Talents } from "./talents"
import { Virtues } from "./virtues"

/**
 * The sticky-header offset, exposed to the markup as a CSS variable so the rail
 * `top`, the section `scroll-mt`, and the JS scroll math in {@link
 * useActiveSection} / {@link JumpNav} all resolve from one number ({@link
 * SHEET_STICKY_OFFSET}) — no Tailwind literal to silently desync.
 */
const STICKY_OFFSET_STYLE = {
  "--sheet-sticky-offset": `${SHEET_STICKY_OFFSET}px`,
} as CSSProperties

/**
 * Resolves the story section currently in view to drive the {@link JumpNav}
 * highlight. Probes section tops against the scroll position (offset for the
 * sticky header) and returns the last one scrolled past. Window-scroll based —
 * the document, not an inner container, is what scrolls on the sheet — and
 * rAF-throttled so a burst of scroll events collapses to one measure per frame.
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

    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        resolve()
      })
    }

    resolve()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) cancelAnimationFrame(frame)
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

  const counts: Record<string, number> = {
    "explore-knives": character.knives.length,
    "explore-chains": character.chains.length,
  }
  const navItems: JumpNavItem[] = STORY_SECTIONS.map((section) => ({
    ...section,
    count: counts[section.id],
  }))

  return (
    <div
      style={STICKY_OFFSET_STYLE}
      className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start"
    >
      <aside className="flex flex-col gap-4 lg:sticky lg:top-[var(--sheet-sticky-offset)]">
        <section aria-label="Virtues">
          <Virtues />
        </section>
        <section aria-label="Talents">
          <Talents />
        </section>
        <JumpNav items={navItems} active={active} />
      </aside>

      <div className="flex flex-col gap-4">
        <ExploreSections />
      </div>
    </div>
  )
}
