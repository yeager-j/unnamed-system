"use client"

import { SparkleIcon, TreeStructureIcon, XIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useCallback, useSyncExternalStore } from "react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"

import {
  dismissalStorageKey,
  shouldShowRanksBanner,
} from "./ranks-banner-visibility"

const dismissedEventName = "ranks-banner:dismissed"

function readDismissedAtCount(characterId: string): number {
  const stored = sessionStorage.getItem(dismissalStorageKey(characterId))
  return stored === null ? 0 : Number(stored)
}

/**
 * Sheet-wide reminder (UNN-255) that the owner has Saved Archetype Ranks to
 * spend, with a CTA into the {@link https://linear.app/unnamed-system/issue/UNN-239 Lineage Atlas}.
 * The primary discoverability affordance for the Atlas alongside the permanent
 * link on the Archetypes tab.
 *
 * Owner-only (a public viewer never sees it). The rank count comes from the
 * optimistic {@link useCharacter} context, so spending in the Atlas or a
 * level-up updates the banner live. Dismissal is session-scoped client state in
 * `sessionStorage` — it survives navigating to the Atlas and back, but a fresh
 * grant re-surfaces the banner. The banner lives only in the sheet route, so it
 * is naturally absent on the dedicated Atlas page.
 */
export function RanksBanner() {
  const role = useViewerRole()
  const { id, shortId, savedArchetypeRanks: ranks } = useCharacter()

  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange)
    window.addEventListener(dismissedEventName, onChange)
    return () => {
      window.removeEventListener("storage", onChange)
      window.removeEventListener(dismissedEventName, onChange)
    }
  }, [])

  // `sessionStorage` is an external store: read it through `useSyncExternalStore`
  // rather than an effect, so there's no hydration mismatch and a dismissal in
  // another tab re-renders here too. The server/first-paint snapshot is
  // `Infinity`, which keeps the banner hidden until the client has read the real
  // dismissed count (the predicate can never beat an infinite threshold).
  const dismissedAtCount = useSyncExternalStore(
    subscribe,
    () => readDismissedAtCount(id),
    () => Number.POSITIVE_INFINITY
  )

  if (role !== "owner" || !shouldShowRanksBanner(ranks, dismissedAtCount)) {
    return null
  }

  const dismiss = () => {
    sessionStorage.setItem(dismissalStorageKey(id), String(ranks))
    window.dispatchEvent(new Event(dismissedEventName))
  }

  return (
    <Alert role="status" variant="primary">
      <SparkleIcon weight="fill" aria-hidden />
      <AlertTitle>
        You have <span className="font-semibold tabular-nums">{ranks}</span>{" "}
        Archetype Rank{ranks === 1 ? "" : "s"} to spend
      </AlertTitle>
      <AlertDescription>
        Unlock a new one or rank up one you own.
      </AlertDescription>
      <Button
        size="sm"
        nativeButton={false}
        className="col-start-2 mt-1 w-fit justify-self-start"
        render={<Link href={`/c/${shortId}/archetypes/atlas`} />}
      >
        <TreeStructureIcon aria-hidden />
        Open Lineage Atlas
      </Button>
      <AlertAction>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          <XIcon weight="bold" aria-hidden />
        </Button>
      </AlertAction>
    </Alert>
  )
}
