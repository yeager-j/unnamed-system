"use client"

import { useEffect, useState } from "react"

/**
 * Picks the Drawer side based on viewport width. On mobile a bottom sheet has
 * native ergonomics (swipe-to-dismiss, full-width readable); on desktop a
 * bottom sheet eats the whole screen so we slide in from the right (Vaul's
 * right-side direction caps at `sm:max-w-sm`, ~384px). SSR defaults to the
 * mobile choice since the Drawer is closed at first render — by the time a
 * user opens it the post-hydration effect has set the desktop direction.
 */
export function useDrawerDirection(): "bottom" | "right" {
  const [direction, setDirection] = useState<"bottom" | "right">("bottom")
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const update = () => setDirection(mql.matches ? "right" : "bottom")
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])
  return direction
}
