import { getAilment } from "@workspace/game/data"

/**
 * The Ailment column wrapper used by the public sheet. Renders the heading
 * and the list of {@link AilmentEntries}. Owner mode renders the entries
 * inside an editor popover trigger and supplies its own wrapper, so this
 * component stays a pure read display.
 */
export function AilmentList({
  ailmentKeys,
}: {
  ailmentKeys: readonly string[]
}) {
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Ailment
      </p>
      <AilmentEntries ailmentKeys={ailmentKeys} />
    </div>
  )
}

export function AilmentEntries({
  ailmentKeys,
}: {
  ailmentKeys: readonly string[]
}) {
  if (ailmentKeys.length === 0) {
    return (
      <p aria-label="No ailment" className="text-sm text-muted-foreground">
        —
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {ailmentKeys.map((key) => {
        const canonical = getAilment(key)
        return (
          <li key={key} className="flex flex-col gap-0.5">
            <span className="font-medium text-destructive">
              {canonical?.name ?? key}
            </span>
            {canonical ? (
              <span className="text-muted-foreground">
                {canonical.description}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
