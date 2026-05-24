"use client"

import { CameraIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useEffect, useEffectEvent, useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import {
  removeCharacterPortraitAction,
  uploadCharacterPortraitAction,
} from "@/lib/actions/character-identity"
import { MAX_PORTRAIT_BYTES } from "@/lib/storage/portrait-upload"

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

/**
 * Portrait picker for the Basic info step. Click the "Change portrait"
 * button to open the OS file picker; client-side mime + size pre-check
 * matches what the server enforces so the user gets fast feedback. The
 * uploaded URL is reflected back via `serverPortraitUrl` after the
 * `revalidatePath` round-trip; the component itself doesn't keep optimistic
 * URL state because there's no debounce window — the server is the source
 * of truth as soon as the action resolves.
 *
 * **Version handling.** Identity-class writes from sibling editors (name,
 * pronouns) bump `identityVersion` on the row without this component's
 * `identityVersion` prop necessarily updating in time, so the portrait
 * actions go through {@link dispatchCharacterWriteWithRetry} — the same
 * silent-stale-retry + cross-tab-broadcast pipeline the auto-save hook
 * uses. The `versionRef` is the live token: it's seeded from the prop on
 * mount, refreshed automatically on a stale refetch, and bumped on every
 * successful write here. The prop continues to drive the ref via
 * `syncFromServer` whenever the server props change (revalidation,
 * router.refresh()).
 */
export function PortraitUpload({
  characterId,
  characterName,
  portraitUrl,
  identityVersion,
}: {
  characterId: string
  characterName: string
  portraitUrl: string | null
  identityVersion: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const versionRef = useRef(identityVersion)

  // Mirror the auto-save hook's prop-sync pattern: prop bumps (from a
  // sibling tab's broadcast → router.refresh, or from a same-tab
  // revalidation) reset the ref so the next write starts from the latest
  // known server token. Without this, an in-tab name save that lands
  // *between* renders here would leave the ref stale until the user
  // happens to upload again.
  const syncFromServer = useEffectEvent(() => {
    versionRef.current = identityVersion
  })
  useEffect(() => {
    syncFromServer()
  }, [identityVersion])

  const previewSrc =
    portraitUrl ??
    `https://avatar.vercel.sh/${encodeURIComponent(characterName || "untitled")}`

  function openPicker() {
    inputRef.current?.click()
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // allow re-picking the same file
    if (!file) return

    if (file.size > MAX_PORTRAIT_BYTES) {
      toast.error("That image is over 5 MB. Pick a smaller one.")
      return
    }
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Portraits must be a JPEG, PNG, WebP, or GIF.")
      return
    }

    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: async (expectedVersion) => {
          const formData = new FormData()
          formData.append("characterId", characterId)
          formData.append("expectedVersion", String(expectedVersion))
          formData.append("file", file)
          return uploadCharacterPortraitAction(formData)
        },
      })
      if (!result.ok) {
        toast.error(messageForUploadError(result.error))
      }
    })
  }

  function onRemove() {
    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          removeCharacterPortraitAction({
            characterId,
            expectedVersion,
          }),
      })
      if (!result.ok) {
        toast.error("Couldn't remove the portrait. Try again.")
      }
    })
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <Avatar size="xl">
        <AvatarImage src={previewSrc} alt="" />
        <AvatarFallback>{initials(characterName)}</AvatarFallback>
      </Avatar>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onFileSelected}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openPicker}
          disabled={isPending}
        >
          {isPending ? <Spinner /> : <CameraIcon weight="bold" />}
          {portraitUrl ? "Replace" : "Upload portrait"}
        </Button>
        {portraitUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={isPending}
          >
            <TrashIcon weight="bold" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function initials(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "??"
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

function messageForUploadError(error: string): string {
  switch (error) {
    case "too-large":
      return "That image is over 5 MB. Pick a smaller one."
    case "invalid-mime":
      return "Portraits must be a JPEG, PNG, WebP, or GIF."
    case "empty-file":
      return "That file looks empty."
    case "stale":
      return "Couldn't sync — refresh to see the latest changes."
    case "character-not-found":
      return "This character was deleted. Head back to your roster."
    default:
      return "Couldn't upload. Try again."
  }
}
