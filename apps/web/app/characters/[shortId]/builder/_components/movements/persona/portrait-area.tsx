"use client"

import { CameraIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRef, useTransition } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  useEntityColumnWrite,
  useEntityIdentityAction,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"
import { uploadEntityPortraitAction } from "@/lib/actions/entity/columns"
import {
  MAX_PORTRAIT_BYTES,
  messageForPortraitUploadError,
  PORTRAIT_ACCEPT,
} from "@/lib/storage/portrait-upload"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * Movement 4's portrait area. Sits at the visual top of the page. When
 * empty, renders a quiet cream placeholder (no gradient) — the saturated
 * avatar.vercel.sh service is skipped entirely so the page doesn't compete
 * with the name field for attention. Once uploaded, the image fills the
 * same circular frame.
 *
 * Upload is a single-attempt lifecycle action: it waits for current replica
 * writes, captures an identity precondition, then uploads exactly once because
 * retrying a stale response would upload the same Blob twice. Removal is a
 * replayable `entity.setColumn` mutation. Client-side mime + size guards mirror
 * what the server enforces so the user gets fast feedback.
 */
export function PortraitArea() {
  const { profile } = useLoadedCharacter()
  const portraitUrl = profile.portraitUrl
  const identityAction = useEntityIdentityAction()
  const columnWrite = useEntityColumnWrite()
  const [pending, startTransition] = useTransition()
  const disabled = pending || columnWrite.pending
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    inputRef.current?.click()
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.size > MAX_PORTRAIT_BYTES) {
      toast.error("That image is over 1 MB. Pick a smaller one.")
      return
    }
    if (!PORTRAIT_ACCEPT.split(",").includes(file.type)) {
      toast.error("Portraits must be a JPEG, PNG, WebP, or GIF.")
      return
    }

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const formData = new FormData()
          const result = await identityAction.runOnce((expectedVersion) => {
            formData.append("entityId", identityAction.entityId)
            formData.append("expectedVersion", String(expectedVersion))
            formData.append("file", file)
            return uploadEntityPortraitAction(formData)
          })
          if (result.ok) return
          if (result.error === "identity-precondition-unavailable") {
            toast.error("Couldn't finish saving recent changes. Try again.")
            return
          }
          toast.error(messageForPortraitUploadError(result.error))
        },
        () => toast.error("Couldn't upload the portrait. Try again.")
      )
    )
  }

  function onRemove() {
    columnWrite.dispatch(
      { column: "portraitUrl", value: null },
      { messages: { error: "Couldn't remove the portrait. Try again." } }
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar className="size-40">
        <AvatarImage src={portraitUrl ?? undefined} alt="" />
        <AvatarFallback className="bg-muted" />
      </Avatar>

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="sr-only"
        onChange={onFileSelected}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openPicker}
          disabled={disabled}
        >
          {pending ? <Spinner /> : <CameraIcon weight="bold" />}
          {portraitUrl ? "Replace" : "Upload portrait"}
        </Button>
        {portraitUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled}
          >
            <TrashIcon weight="bold" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}
