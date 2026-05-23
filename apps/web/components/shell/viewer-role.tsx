"use client"

import { createContext, useContext } from "react"

import type { ViewerRole } from "@/lib/auth/viewer-role"

/**
 * Client-side mirror of {@link getViewerRole} from `lib/auth/viewer-role.ts`.
 * The page route resolves the role server-side once per request and seeds
 * this provider; every client component below reads it via
 * {@link useViewerRole} or the {@link OwnerOnly} convenience wrapper.
 *
 * Affordance rendering only. The server-side `requireOwner` gate is the
 * source of truth for authorization — a missing or tampered context value
 * cannot grant or deny mutation rights, only show or hide the button.
 */
const ViewerRoleContext = createContext<ViewerRole | null>(null)

export function ViewerRoleProvider({
  role,
  children,
}: {
  role: ViewerRole
  children: React.ReactNode
}) {
  return (
    <ViewerRoleContext.Provider value={role}>
      {children}
    </ViewerRoleContext.Provider>
  )
}

/**
 * Reads the current viewer's role from {@link ViewerRoleProvider}. Throws
 * outside a provider so a forgotten wrapper fails loudly instead of
 * silently rendering as `signed-out`.
 */
export function useViewerRole(): ViewerRole {
  const role = useContext(ViewerRoleContext)
  if (!role) {
    throw new Error("useViewerRole must be used within a ViewerRoleProvider")
  }
  return role
}

/**
 * Renders `children` only when the viewer is the character's owner.
 * Signed-in non-owners and signed-out viewers see the same `null` — i.e.
 * the public sheet — which is the threat model the primitive enforces.
 */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  return useViewerRole() === "owner" ? <>{children}</> : null
}

/**
 * The inverse of {@link OwnerOnly}: renders `children` for signed-in
 * non-owners and signed-out viewers. Used to swap an owner-mode affordance
 * for a read-only fallback at the same spot in the tree (e.g. an inline
 * editor vs. a static heading) without restructuring the layout.
 */
export function NonOwner({ children }: { children: React.ReactNode }) {
  return useViewerRole() === "owner" ? null : <>{children}</>
}
