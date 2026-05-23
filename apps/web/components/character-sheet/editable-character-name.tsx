"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { updateCharacterNameAction } from "@/lib/actions/character-name"

const DEBOUNCE_MS = 500
const MAX_LENGTH = 64

/**
 * Owner-only inline editor for the character name. Renders as a borderless
 * input styled to match the surrounding `<h1>`. Auto-save fires on a
 * debounced keystroke and unconditionally on blur; Escape reverts to the
 * last server value.
 *
 * No success indicator: the typed value remaining in the input *is* the
 * confirmation. Only failures surface (Sonner toast + local rollback) so the
 * routine-save channel stays quiet and a real error reads as one.
 *
 * Concurrency: the version token is held in a ref with two writers — every
 * successful save updates it from the action's return value (so a rapid
 * follow-up save sees the new token without waiting for the parent's prop to
 * propagate through React commit + effects), and a `useEffect` mirrors the
 * `updatedAt` prop (so a sibling component bumping the token via its own
 * write lands in our ref too). Single source of truth, two convergent
 * writers.
 */
export function EditableCharacterName({
  characterId,
  name,
  updatedAt,
}: {
  characterId: string
  name: string
  updatedAt: Date
}) {
  const [draft, setDraft] = useState(name)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedRef = useRef(false)
  const lastSavedRef = useRef(name)
  const inFlightRef = useRef<string | null>(null)
  const updatedAtRef = useRef(updatedAt)

  useEffect(() => {
    updatedAtRef.current = updatedAt
  }, [updatedAt])

  useEffect(() => {
    if (focusedRef.current) return
    setDraft(name)
    lastSavedRef.current = name
  }, [name])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  async function save(next: string) {
    const trimmed = next.trim()
    if (trimmed.length === 0) return
    // Skip the already-saved value (no-op edits) and the value currently
    // being saved (the debounce + blur double-fire that would otherwise hit
    // the server with the same `expectedUpdatedAt` twice — the second would
    // race the first's bump and return `"stale"`).
    if (trimmed === lastSavedRef.current || trimmed === inFlightRef.current) {
      return
    }

    inFlightRef.current = trimmed
    try {
      const result = await updateCharacterNameAction({
        characterId,
        name: trimmed,
        expectedUpdatedAt: updatedAtRef.current,
      })

      if (result.ok) {
        lastSavedRef.current = result.value.name
        updatedAtRef.current = result.value.updatedAt
        return
      }

      setDraft(lastSavedRef.current)

      if (result.error === "stale") {
        toast.error(
          "Someone else updated this character — refresh to see the latest."
        )
      } else {
        toast.error("Couldn't save the name change. Try again.")
      }
    } finally {
      if (inFlightRef.current === trimmed) inFlightRef.current = null
    }
  }

  function scheduleSave(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(next), DEBOUNCE_MS)
  }

  function flushSave() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    save(draft)
  }

  return (
    <input
      type="text"
      aria-label="Character name"
      maxLength={MAX_LENGTH}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        scheduleSave(event.target.value)
      }}
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        flushSave()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === "Escape") {
          event.preventDefault()
          setDraft(lastSavedRef.current)
          if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
          }
          event.currentTarget.blur()
        }
      }}
      className={cn(
        "font-heading text-2xl font-semibold",
        "max-w-full min-w-0 border-0 bg-transparent p-0 outline-none",
        "border-b border-transparent transition-colors",
        "focus-visible:border-ring focus-visible:ring-0",
        "hover:border-border"
      )}
    />
  )
}
