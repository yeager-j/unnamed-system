"use client"

import { useRef } from "react"

import { guardWrite } from "@/lib/sync/guard-write-transition"

type Save = () => Promise<void>

/**
 * Runs one save at a time and retains only the newest waiting save per field.
 * Stage writes are per-field LWW, so intermediate values for the same field
 * carry no information once a newer value is waiting. Different fields retain
 * independent slots and still share one serialized spine for the row.
 */
export function useSerializeLatest(
  onError?: (error: unknown) => void
): (key: string, save: Save) => void {
  const runningRef = useRef(false)
  const pendingRef = useRef(new Map<string, Save>())

  async function run(save: Save): Promise<void> {
    try {
      await guardWrite(save, onError ?? (() => {}))
    } finally {
      const next = pendingRef.current.entries().next()
      if (next.done) {
        runningRef.current = false
      } else {
        const [key, nextSave] = next.value
        pendingRef.current.delete(key)
        void run(nextSave)
      }
    }
  }

  return (key, save) => {
    if (runningRef.current) {
      pendingRef.current.delete(key)
      pendingRef.current.set(key, save)
      return
    }

    runningRef.current = true
    void run(save)
  }
}
