"use client"

import { createContext, useCallback, useContext, useState } from "react"

import {
  DEFAULT_DOCUMENT_REF,
  refsEqual,
  type DocumentRef,
} from "@/domain/character/animus/documents"

/**
 * The active-document selection for the Animus writer. The sidebar and the
 * writer pane both read and write the same selection through this context.
 *
 * In the builder the provider is mounted at the layout level (so the selection
 * survives a back-and-forth to a sibling movement) and seeds Backstory; the
 * sheet's `/animus` route seeds `initialRef` from the `?doc=` deep link so a
 * click on a specific section opens straight to that document.
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
  initialRef = DEFAULT_DOCUMENT_REF,
}: {
  children: React.ReactNode
  initialRef?: DocumentRef
}) {
  const [activeRef, setActiveRef] = useState<DocumentRef>(initialRef)

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
