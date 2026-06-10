"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { parseEncounterPing } from "@/hooks/encounter-ping"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { EncounterStatus } from "@/lib/db/schema/encounter"

/**
 * Keeps the campaign page's live banner honest without a reload (UNN-373, ADR
 * Decision 5): one realtime listener per **non-ended** encounter — drafts
 * included, because "the banner appears when combat starts" means hearing a
 * draft's `status: "live"` ping. Renders nothing.
 *
 * Refreshes **only on a status change**: every combat event pings the live
 * encounter's channel with `status: "live"`, so refreshing on every ping would
 * re-render the campaign page once per turn. The per-channel ref map remembers
 * the last seen status (seeded from the server-rendered props) and drops
 * same-status pings. An encounter created after this page rendered has no
 * listener until the next refresh — acceptable, since creation happens through
 * this page's own dialog, which refreshes.
 */
export function EncounterStatusListener({
  encounters,
}: {
  encounters: { shortId: string; status: EncounterStatus }[]
}) {
  const router = useRouter()

  const knownStatuses = useRef<Record<string, EncounterStatus>>({})
  useEffect(() => {
    for (const { shortId, status } of encounters) {
      knownStatuses.current[shortId] = status
    }
  }, [encounters])

  function onPing(shortId: string, data: unknown) {
    const status = parseEncounterPing(data)?.status
    if (status === undefined) return
    if (knownStatuses.current[shortId] === status) return
    knownStatuses.current[shortId] = status
    router.refresh()
  }

  return (
    <>
      {encounters.map(({ shortId }) => (
        <RealtimeChannelListener
          key={shortId}
          domain="encounter"
          shortId={shortId}
          onPing={(data) => onPing(shortId, data)}
          onReconnect={() => router.refresh()}
        />
      ))}
    </>
  )
}
