"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

/**
 * Hides the global {@link import("./site-header").SiteHeader} on full-bleed routes
 * that supply their own floating chrome — the Map editor (`/stage/maps/{shortId}`) and
 * the DM dungeon run console (`/campaigns/{c}/dungeon/{d}`), both immersive canvases
 * (their list pages — `/stage/maps`, the campaign page — keep the header). The header
 * stays a server component (it resolves the session); this thin client wrapper only
 * decides whether to render it.
 */
const FULL_BLEED = [
  /^\/stage\/maps\/[^/]+$/,
  /^\/campaigns\/[^/]+\/dungeon\/[^/]+$/,
]

export function HeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (FULL_BLEED.some((pattern) => pattern.test(pathname))) return null
  return children
}
