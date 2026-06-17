"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { saveMapAction } from "@/lib/actions/save-map"

const DEBOUNCE_MS = 600

/**
 * Debounced auto-save for the Map name (UNN-460) — the no-Save-button editor
 * shell. A focused parallel of the character free-text autosave
 * ({@link import("@/hooks/use-character").useCharacterAutoSave}), but standalone:
 * Map authoring is single-owner with no shared per-class version ref, so this
 * doesn't reach into the character version-class plumbing.
 *
 * Holds the draft `value`, the latest `version` token in a ref (advanced from
 * each save's result), and the `lastSaved` value to skip no-op saves. Saves fire
 * on a debounced keystroke and on `flush` (blur). Saves serialize via a promise
 * chain so a debounce-then-blur pair reads the freshly-bumped token instead of
 * colliding on a stale `expectedVersion`. On any failure the field reverts to the
 * last saved value with a toast — the routine-save channel stays quiet so a real
 * error reads as one.
 *
 * **Geometry** autosave (the canvas's node-drag / adjacency edits) lands with
 * UNN-461; it uses the same {@link saveMapAction}, geometry arm.
 */
export function useMapNameAutoSave({
  mapId,
  serverName,
  serverVersion,
}: {
  mapId: string
  serverName: string
  serverVersion: number
}) {
  const [value, setValue] = useState(serverName)
  const versionRef = useRef(serverVersion)
  const lastSavedRef = useRef(serverName)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    versionRef.current = serverVersion
  }, [serverVersion])

  const save = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      if (trimmed.length === 0 || trimmed === lastSavedRef.current.trim()) {
        return saveQueueRef.current
      }

      saveQueueRef.current = saveQueueRef.current.then(async () => {
        const result = await saveMapAction({
          mapId,
          expectedVersion: versionRef.current,
          patch: { field: "name", name: trimmed },
        })
        if (result.ok) {
          versionRef.current = result.value.version
          lastSavedRef.current = trimmed
          return
        }
        toast.error("Couldn't save the map name. Try again.")
        setValue(lastSavedRef.current)
      })

      return saveQueueRef.current
    },
    [mapId]
  )

  const onChange = useCallback(
    (next: string) => {
      setValue(next)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => void save(next), DEBOUNCE_MS)
    },
    [save]
  )

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    void save(value)
  }, [save, value])

  const revert = useCallback(() => setValue(lastSavedRef.current), [])

  return { value, onChange, flush, revert }
}
