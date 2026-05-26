"use client"

import { createContext, useCallback, useContext, useState } from "react"

import { DEFAULT_DOCUMENT_REF, refsEqual, type DocumentRef } from "./documents"

/**
 * The active-document selection for Movement 3 (the writer view). The sidebar
 * (mounted at the builder layout level so it persists across step
 * navigations) and the writer pane (mounted only on `/animus`) both read
 * and write the same selection through this context.
 *
 * The provider is mounted at the layout level even on non-animus steps so
 * that state survives a back-and-forth to `corpus` or `ortus`. Off-route the
 * context is functionally inert — nothing reads `activeRef` until the pane
 * mounts on `/animus`.
 */

export interface AnimusDocumentContextValue {
  activeRef: DocumentRef
  selectDocument: (ref: DocumentRef) => void
  /**
   * Reset to the default selection (Backstory). Called by the sidebar after
   * removing the currently-active Knife/Chain so the pane has something to
   * render.
   */
  resetToDefault: () => void
}

const AnimusDocumentContext = createContext<AnimusDocumentContextValue | null>(
  null
)

export function AnimusDocumentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeRef, setActiveRef] = useState<DocumentRef>(DEFAULT_DOCUMENT_REF)

  const selectDocument = useCallback((ref: DocumentRef) => {
    setActiveRef((prev) => (refsEqual(prev, ref) ? prev : ref))
  }, [])

  const resetToDefault = useCallback(() => {
    setActiveRef(DEFAULT_DOCUMENT_REF)
  }, [])

  return (
    <AnimusDocumentContext.Provider
      value={{ activeRef, selectDocument, resetToDefault }}
    >
      {children}
    </AnimusDocumentContext.Provider>
  )
}

export function useAnimusDocument(): AnimusDocumentContextValue {
  const ctx = useContext(AnimusDocumentContext)
  if (!ctx) {
    throw new Error(
      "useAnimusDocument must be used within an AnimusDocumentProvider."
    )
  }
  return ctx
}
