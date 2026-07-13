"use client"

import type { ReactNode } from "react"

import { useRunnerSelection, type RunnerMode } from "./runner-selection"

/**
 * Renders its children only outside the given runner mode — the page wraps
 * the roster `<Sidebar>` in this so the Day-End Capture ritual gets the
 * handoff's undivided single column (the sidebar returns on "← Back").
 */
export function HiddenInMode({
  mode,
  children,
}: {
  mode: RunnerMode
  children: ReactNode
}) {
  const selection = useRunnerSelection()
  return selection.mode === mode ? null : <>{children}</>
}
