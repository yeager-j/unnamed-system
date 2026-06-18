"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

/**
 * Hides the global {@link import("./site-header").SiteHeader} on full-bleed routes
 * that supply their own floating chrome — today just the Map editor
 * (`/maps/{shortId}`), which is an immersive canvas (the My Maps list at `/maps`
 * keeps the header). The header stays a server component (it resolves the session);
 * this thin client wrapper only decides whether to render it.
 */
const FULL_BLEED = [/^\/maps\/[^/]+$/]

export function HeaderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (FULL_BLEED.some((pattern) => pattern.test(pathname))) return null
  return children
}
