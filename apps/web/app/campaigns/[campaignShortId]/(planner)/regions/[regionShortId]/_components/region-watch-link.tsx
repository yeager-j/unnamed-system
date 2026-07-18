"use client"

import { CheckIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

/**
 * The Region's **stable** player watch link on its detail page (UNN-589). Unlike a
 * per-expedition watch URL, this one URL points at whichever expedition is running
 * ({@link import("@/lib/paths").regionWatchPath} → the redirect resolves it), so
 * players keep a single link across the Region's whole life. Copy writes the
 * absolute URL (origin resolved client-side), mirroring the invite-link card's copy.
 */
export function RegionWatchLink({ watchPath }: { watchPath: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      const url =
        typeof window === "undefined"
          ? watchPath
          : `${window.location.origin}${watchPath}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Watch link copied.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={watchPath}
          className="flex-1 font-mono text-sm"
        />
        <Button variant="outline" onClick={onCopy}>
          {copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="bold" />}
          Copy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Players keep this one link across expeditions.
      </p>
    </div>
  )
}
