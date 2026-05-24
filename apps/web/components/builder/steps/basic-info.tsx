import { EditableName } from "./editable-name"
import { EditablePronouns } from "./editable-pronouns"
import { PortraitUpload } from "./portrait-upload"

/**
 * Step 1 of the builder — portrait, name, and pronouns. The portrait sits
 * at the top so the player gets the most visual feedback for the smallest
 * input; name + pronouns are below as standard text fields. All three
 * auto-save independently via the UNN-180 hook (and the upload, on
 * success). No "Save" button anywhere.
 */
export function BasicInfoStep({
  characterId,
  name,
  pronouns,
  portraitUrl,
  identityVersion,
}: {
  characterId: string
  name: string
  pronouns: string | null
  portraitUrl: string | null
  identityVersion: number
}) {
  return (
    <div className="flex flex-col gap-6">
      <PortraitUpload
        characterId={characterId}
        characterName={name}
        portraitUrl={portraitUrl}
        identityVersion={identityVersion}
      />

      <EditableName
        characterId={characterId}
        name={name}
        identityVersion={identityVersion}
      />

      <EditablePronouns
        characterId={characterId}
        pronouns={pronouns ?? ""}
        identityVersion={identityVersion}
      />
    </div>
  )
}
